import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@nongchang/shared';
import type { AuthUser, TraceScanItem, AntiFakeAlert, FreezeResponse } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

const WINDOW_MS = 3600_000;
const MIN_DISTINCT_IPS = 3;
const MIN_SCANS = 5;

interface ScanRow {
  id: string; code: string; batchId: string; ip: string;
  userAgent: string | null; scannedAt: Date;
}

@Injectable()
export class AntiFakeService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  /** 把业务作用域(ownerId/agentId)转成 TraceScan 的 where。
   *  TraceScan 无 ownerId,故先解析作用域内的 batchId 集合,再按 batchId 过滤。
   *  sysadmin 直接按 tenantId。fail-closed 由 ScopeService 保证。 */
  private async scanWhere(user: AuthUser): Promise<Record<string, unknown>> {
    if (user.role === Role.SYSTEM_ADMIN) return { tenantId: user.tenantId };
    // 非 sysadmin:经 ScopeService(fail-closed)解析归属,再转成作用域内的 batchId 集合。
    // 空集合时 Prisma `in: []` 匹配零行,安全退化为"什么都看不到"。
    const owned = await this.scope.ownedScopeWhere(this.prisma, user);
    const batches = await this.prisma.batch.findMany({
      where: owned as any, select: { id: true },
    });
    return { tenantId: user.tenantId, batchId: { in: batches.map((b) => b.id) } };
  }

  async listScans(user: AuthUser, limit: number): Promise<TraceScanItem[]> {
    const where = await this.scanWhere(user);
    const rows = (await this.prisma.traceScan.findMany({
      where, orderBy: { scannedAt: 'desc' }, take: limit,
    })) as ScanRow[];
    return rows.map((r) => ({
      id: r.id, code: r.code, batchId: r.batchId, ip: r.ip,
      userAgent: r.userAgent, scannedAt: r.scannedAt.toISOString(),
    }));
  }

  async listAlerts(user: AuthUser): Promise<AntiFakeAlert[]> {
    const where = { ...(await this.scanWhere(user)), scannedAt: { gte: new Date(Date.now() - WINDOW_MS) } };
    const rows = (await this.prisma.traceScan.findMany({ where })) as ScanRow[];
    const byCode = new Map<string, ScanRow[]>();
    for (const r of rows) {
      const list = byCode.get(r.code) ?? [];
      list.push(r);
      byCode.set(r.code, list);
    }
    const alerts: AntiFakeAlert[] = [];
    for (const [code, list] of byCode) {
      const ips = new Set(list.map((r) => r.ip));
      if (ips.size < MIN_DISTINCT_IPS || list.length < MIN_SCANS) continue;
      const tc = await this.prisma.traceCode.findFirst({ where: { code, tenantId: user.tenantId } });
      const last = list.reduce((a, b) => (a.scannedAt > b.scannedAt ? a : b));
      alerts.push({
        code, batchId: list[0].batchId, distinctIps: ips.size, scanCount: list.length,
        locations: [...ips], lastScanAt: last.scannedAt.toISOString(), frozen: tc?.status === 'frozen',
      });
    }
    return alerts.sort((a, b) => b.scanCount - a.scanCount);
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
    return { code, frozen: status === 'frozen' };
  }
}
