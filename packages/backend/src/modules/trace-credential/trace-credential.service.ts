import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import type { AuthUser, CreateTraceCredentialInput, TraceCredentialView } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import {
  TRACE_CREDENTIAL_INVALID_URL_MESSAGE,
  TRACE_CREDENTIAL_NO_TRUSTED_ORIGIN_MESSAGE,
  TRACE_CREDENTIAL_UNTRUSTED_ORIGIN_MESSAGE,
  buildTraceCredentialCreateData,
  buildTrustedFileOrigins,
  toTraceCredentialView,
  validateTrustedFileUrl,
} from './trace-credential.model';
import type { CredentialRow, OssConfigRow } from './trace-credential.model';
import { PublicTraceCacheService } from '../public-trace/public-trace-cache.service';

@Injectable()
export class TraceCredentialService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
    @Optional() private cache?: PublicTraceCacheService,
  ) {}

  private async trustedFileOrigins(tenantId: string): Promise<Set<string>> {
    const ossConfig = (await this.prisma.ossConfig.findUnique({
      where: { tenantId },
      select: { enabled: true, baseUrl: true },
    })) as OssConfigRow | null;
    return buildTrustedFileOrigins({ ossConfig, envBaseUrl: process.env.OSS_BASE_URL });
  }

  private async assertTrustedFileUrl(tenantId: string, fileUrl: string): Promise<void> {
    const result = validateTrustedFileUrl(fileUrl, await this.trustedFileOrigins(tenantId));
    if (result.ok) return;
    if (result.reason === 'invalid-url') throw new BadRequestException(TRACE_CREDENTIAL_INVALID_URL_MESSAGE);
    if (result.reason === 'missing-trusted-origin') throw new BadRequestException(TRACE_CREDENTIAL_NO_TRUSTED_ORIGIN_MESSAGE);
    throw new BadRequestException(TRACE_CREDENTIAL_UNTRUSTED_ORIGIN_MESSAGE);
  }

  /** 列出某批次的资质/检测文件。先校验 batch 在作用域内(fail-closed)。 */
  async list(user: AuthUser, batchId: string): Promise<TraceCredentialView[]> {
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
    const rows = (await this.prisma.traceCredential.findMany({
      where: { tenantId: user.tenantId, batchId }, orderBy: { createdAt: 'desc' },
    })) as CredentialRow[];
    return rows.map(toTraceCredentialView);
  }

  /** 为批次登记资质/检测文件。先校验 batch 归属(fail-closed)。 */
  async create(user: AuthUser, input: CreateTraceCredentialInput): Promise<TraceCredentialView> {
    await this.scope.assertInScope(this.prisma, user, 'batch', input.batchId);
    await this.assertTrustedFileUrl(user.tenantId, input.fileUrl);
    const row = (await this.prisma.traceCredential.create({
      data: buildTraceCredentialCreateData({ tenantId: user.tenantId, dto: input }),
    })) as CredentialRow;
    this.cache?.invalidateBatch(input.batchId);
    return toTraceCredentialView(row);
  }

  /** 删除资质/检测文件。校验记录存在且其 batch 在作用域内,否则 fail-closed。 */
  async remove(user: AuthUser, id: string): Promise<{ id: string }> {
    const cred = (await this.prisma.traceCredential.findFirst({
      where: { id, tenantId: user.tenantId },
    })) as { id: string; batchId: string } | null;
    if (!cred) throw new ForbiddenException('资质记录不在可操作范围内');
    await this.scope.assertInScope(this.prisma, user, 'batch', cred.batchId);
    await this.prisma.traceCredential.delete({ where: { id } });
    this.cache?.invalidateBatch(cred.batchId);
    return { id };
  }
}
