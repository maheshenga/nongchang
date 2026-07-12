import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@nongchang/shared';
import type { AuthUser, TraceScanItem, AntiFakeAlert, FreezeResponse } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import {
  buildAlertWindowWhere,
  buildAntiFakeAlertCandidates,
  buildAntiFakeAlerts,
  buildFreezeResponse,
  buildTraceCodeStatusWhere,
  buildTraceScanItem,
  type ScanRow,
  type TraceCodeStatusRow,
} from './anti-fake.model';

@Injectable()
export class AntiFakeService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  /** 通过 batch.owner 关系约束 TraceScan/TraceCode，避免预加载并展开 batch IDs。 */
  private scanWhere(user: AuthUser): Record<string, unknown> {
    if (user.role === Role.SYSTEM_ADMIN) return { tenantId: user.tenantId };
    return {
      tenantId: user.tenantId,
      batch: { is: this.scope.ownedEntityWhere(user) },
    };
  }

  async listScans(user: AuthUser, limit: number): Promise<TraceScanItem[]> {
    const where = await this.scanWhere(user);
    const rows = (await this.prisma.traceScan.findMany({
      where, orderBy: { scannedAt: 'desc' }, take: limit,
    })) as ScanRow[];
    return rows.map(buildTraceScanItem);
  }

  async listAlerts(user: AuthUser): Promise<AntiFakeAlert[]> {
    const where = buildAlertWindowWhere(await this.scanWhere(user), Date.now());
    const rows = (await this.prisma.traceScan.findMany({ where })) as ScanRow[];
    // 先按阈值筛出疑似告警 code,再一次性批量查 traceCode 取冻结状态(避免逐 code N+1 查询)。
    const candidates = buildAntiFakeAlertCandidates(rows);
    if (candidates.length === 0) return [];

    const tcs = (await this.prisma.traceCode.findMany({
      where: buildTraceCodeStatusWhere(user.tenantId, candidates.map((c) => c.code)),
      select: { code: true, status: true },
    })) as TraceCodeStatusRow[];
    return buildAntiFakeAlerts({ candidates, statuses: tcs });
  }

  async freeze(user: AuthUser, code: string): Promise<FreezeResponse> {
    return this.setStatus(user, code, 'frozen');
  }
  async unfreeze(user: AuthUser, code: string): Promise<FreezeResponse> {
    return this.setStatus(user, code, 'active');
  }

  /** 校验该 code 在调用者作用域内(经 batchId 集合),否则 fail-closed 抛 Forbidden。 */
  private async setStatus(user: AuthUser, code: string, status: 'frozen' | 'active'): Promise<FreezeResponse> {
    const where = await this.scanWhere(user);
    const tc = await this.prisma.traceCode.findFirst({
      where: { code, ...(where as object) } as any,
    });
    if (!tc) throw new ForbiddenException('溯源码不在可操作范围内');
    await this.prisma.traceCode.update({ where: { code }, data: { status } });
    return buildFreezeResponse(code, status);
  }
}
