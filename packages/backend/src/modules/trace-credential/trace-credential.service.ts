import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser, CreateTraceCredentialInput, TraceCredentialView, TraceCredentialType } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

interface CredentialRow {
  id: string; batchId: string; type: string; title: string; issuer: string;
  serialNo: string | null; issuedAt: Date | null; fileUrl: string; createdAt: Date;
}

function toView(r: CredentialRow): TraceCredentialView {
  return {
    id: r.id, batchId: r.batchId, type: r.type as TraceCredentialType, title: r.title, issuer: r.issuer,
    serialNo: r.serialNo, issuedAt: r.issuedAt ? r.issuedAt.toISOString() : null,
    fileUrl: r.fileUrl, createdAt: r.createdAt.toISOString(),
  };
}

@Injectable()
export class TraceCredentialService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  /** 列出某批次的资质/检测文件。先校验 batch 在作用域内(fail-closed)。 */
  async list(user: AuthUser, batchId: string): Promise<TraceCredentialView[]> {
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
    const rows = (await this.prisma.traceCredential.findMany({
      where: { tenantId: user.tenantId, batchId }, orderBy: { createdAt: 'desc' },
    })) as CredentialRow[];
    return rows.map(toView);
  }

  /** 为批次登记资质/检测文件。先校验 batch 归属(fail-closed)。 */
  async create(user: AuthUser, input: CreateTraceCredentialInput): Promise<TraceCredentialView> {
    await this.scope.assertInScope(this.prisma, user, 'batch', input.batchId);
    const row = (await this.prisma.traceCredential.create({
      data: {
        tenantId: user.tenantId, batchId: input.batchId, type: input.type, title: input.title,
        issuer: input.issuer, serialNo: input.serialNo ?? null,
        issuedAt: input.issuedAt ? new Date(input.issuedAt) : null, fileUrl: input.fileUrl,
      },
    })) as CredentialRow;
    return toView(row);
  }

  /** 删除资质/检测文件。校验记录存在且其 batch 在作用域内,否则 fail-closed。 */
  async remove(user: AuthUser, id: string): Promise<{ id: string }> {
    const cred = (await this.prisma.traceCredential.findFirst({
      where: { id, tenantId: user.tenantId },
    })) as { id: string; batchId: string } | null;
    if (!cred) throw new ForbiddenException('资质记录不在可操作范围内');
    await this.scope.assertInScope(this.prisma, user, 'batch', cred.batchId);
    await this.prisma.traceCredential.delete({ where: { id } });
    return { id };
  }
}
