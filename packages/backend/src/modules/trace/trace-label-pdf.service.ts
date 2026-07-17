import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser, ResolvedTraceLabelPdfInput } from '@nongchang/shared';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { ScopeService } from '../../common/scope/scope.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildTraceLabelPdfFileName,
  normalizeTraceWebBaseUrl,
} from './trace-label-pdf.model';
import {
  TraceLabelPdfFontError,
  TraceLabelPdfRenderer,
} from './trace-label-pdf.renderer';

export interface TraceLabelPdfFile {
  bytes: Uint8Array;
  fileName: string;
  labelCount: number;
  pageCount: number;
}

@Injectable()
export class TraceLabelPdfService {
  private fontBytes?: Uint8Array;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly renderer: TraceLabelPdfRenderer,
  ) {}

  private async loadFontBytes(): Promise<Uint8Array> {
    if (this.fontBytes) return this.fontBytes;

    const fontPath = process.env.TRACE_PDF_FONT_PATH?.trim();
    const extension = fontPath ? extname(fontPath).toLowerCase() : '';
    if (!fontPath || (extension !== '.ttf' && extension !== '.otf')) {
      throw new ServiceUnavailableException('PDF 中文字体不可用，请联系管理员检查字体配置');
    }

    try {
      const file = await stat(fontPath);
      if (!file.isFile()) throw new Error('font path is not a file');
      const bytes = await readFile(fontPath);
      if (bytes.length === 0) throw new Error('font file is empty');
      this.fontBytes = new Uint8Array(bytes);
      return this.fontBytes;
    } catch {
      throw new ServiceUnavailableException('PDF 中文字体不可用，请联系管理员检查字体配置');
    }
  }

  async create(
    user: AuthUser,
    batchId: string,
    input: ResolvedTraceLabelPdfInput,
  ): Promise<TraceLabelPdfFile> {
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);

    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, tenantId: user.tenantId },
      select: { batchNo: true, cropName: true },
    });
    if (!batch) throw new ForbiddenException('批次不在可操作范围内');

    const requestedIds = input.codeIds;
    if (requestedIds && (requestedIds.length < 1 || requestedIds.length > 500)) {
      throw new BadRequestException('单次只能导出 1~500 个溯源码标签');
    }

    const codes = await this.prisma.traceCode.findMany({
      where: {
        tenantId: user.tenantId,
        batchId,
        ...(requestedIds ? { id: { in: requestedIds } } : {}),
      },
      select: { id: true, code: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...(!requestedIds ? { take: 501 } : {}),
    });

    if (requestedIds) {
      const foundIds = new Set(codes.map((code) => code.id));
      if (codes.length !== requestedIds.length || requestedIds.some((id) => !foundIds.has(id))) {
        throw new ForbiddenException('所选溯源码不完全属于当前批次');
      }
    } else if (codes.length === 0) {
      throw new BadRequestException('该批次尚未生成溯源码');
    } else if (codes.length > 500) {
      throw new BadRequestException('该批次溯源码超过 500 个，请分批选择后导出');
    }

    const webBaseUrl = normalizeTraceWebBaseUrl(process.env.WEB_BASE_URL, process.env.NODE_ENV);
    const fontBytes = await this.loadFontBytes();

    try {
      const rendered = await this.renderer.render({
        batchNo: batch.batchNo,
        cropName: batch.cropName,
        codes: codes.map(({ code }) => ({ code })),
        options: input,
        webBaseUrl,
        fontBytes,
      });

      return {
        bytes: rendered.bytes,
        fileName: buildTraceLabelPdfFileName(batch.batchNo),
        labelCount: codes.length,
        pageCount: rendered.pageCount,
      };
    } catch (error) {
      if (error instanceof TraceLabelPdfFontError) {
        throw new ServiceUnavailableException('PDF 中文字体不可用，请联系管理员检查字体配置');
      }
      throw error;
    }
  }
}
