import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role, type AntiFakeAlert, type AuthUser, type FreezeResponse, type TraceScanItem } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import {
  buildFreezeResponse,
  buildTraceScanItem,
  normalizeAntiFakeAlertQuery,
  type AntiFakeAlertQueryInput,
  type ScanRow,
} from './anti-fake.model';

interface AntiFakeAggregateRow {
  code: string;
  batchId: string;
  distinctIps: bigint | number;
  scanCount: bigint | number;
  locations: string[];
  lastScanAt: Date;
  frozen: boolean;
}

@Injectable()
export class AntiFakeService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  private scanWhere(user: AuthUser): Record<string, unknown> {
    if (user.role === Role.SYSTEM_ADMIN) return { tenantId: user.tenantId };
    return {
      tenantId: user.tenantId,
      batch: { is: this.scope.ownedEntityWhere(user) },
    };
  }

  async listScans(user: AuthUser, limit: number): Promise<TraceScanItem[]> {
    const where = this.scanWhere(user);
    const rows = (await this.prisma.traceScan.findMany({
      where, orderBy: { scannedAt: 'desc' }, take: limit,
    })) as ScanRow[];
    return rows.map(buildTraceScanItem);
  }

  async listAlerts(user: AuthUser, input: AntiFakeAlertQueryInput = {}): Promise<AntiFakeAlert[]> {
    const query = normalizeAntiFakeAlertQuery(input);
    const scope = this.scope.ownedEntityWhere(user) as {
      ownerId?: string;
      owner?: { is?: { agentId?: string } };
    };
    const ownerId = scope.ownerId ?? null;
    const agentId = scope.owner?.is?.agentId ?? null;
    const tenantWide = user.role === Role.SYSTEM_ADMIN;
    const cutoff = new Date(query.now.getTime() - query.windowMinutes * 60_000);

    const rows = await this.prisma.$queryRaw<AntiFakeAggregateRow[]>`
      SELECT
        s.code,
        s.batch_id AS "batchId",
        COUNT(DISTINCT s.ip) AS "distinctIps",
        COUNT(*) AS "scanCount",
        ARRAY_AGG(DISTINCT s.ip ORDER BY s.ip) AS locations,
        MAX(s.scanned_at) AS "lastScanAt",
        COALESCE(BOOL_OR(tc.status = 'frozen'), false) AS frozen
      FROM trace_scans s
      JOIN batches b ON b.id = s.batch_id AND b.tenant_id = s.tenant_id
      JOIN users owner ON owner.id = b.owner_id AND owner.tenant_id = b.tenant_id
      LEFT JOIN trace_codes tc ON tc.code = s.code AND tc.tenant_id = s.tenant_id
      WHERE s.tenant_id = ${user.tenantId}
        AND s.scanned_at >= ${cutoff}
        AND (
          ${tenantWide}
          OR (${ownerId}::text IS NOT NULL AND b.owner_id = ${ownerId}::text)
          OR (${agentId}::text IS NOT NULL AND owner.agent_id = ${agentId}::text AND owner.role = ${Role.MERCHANT}::"Role")
        )
      GROUP BY s.code, s.batch_id
      HAVING COUNT(*) >= ${query.minScans}
        AND COUNT(DISTINCT s.ip) >= ${query.minDistinctIps}
      ORDER BY "scanCount" DESC, "distinctIps" DESC, s.code ASC
      LIMIT ${query.limit}
    `;

    return rows.map((row) => ({
      code: row.code,
      batchId: row.batchId,
      distinctIps: Number(row.distinctIps),
      scanCount: Number(row.scanCount),
      locations: row.locations,
      lastScanAt: row.lastScanAt.toISOString(),
      frozen: row.frozen,
    }));
  }

  async freeze(user: AuthUser, code: string): Promise<FreezeResponse> {
    return this.setStatus(user, code, 'frozen');
  }

  async unfreeze(user: AuthUser, code: string): Promise<FreezeResponse> {
    return this.setStatus(user, code, 'active');
  }

  private async setStatus(user: AuthUser, code: string, status: 'frozen' | 'active'): Promise<FreezeResponse> {
    const where = this.scanWhere(user);
    const tc = await this.prisma.traceCode.findFirst({
      where: { code, ...(where as object) } as any,
    });
    if (!tc) throw new ForbiddenException('溯源码不在可操作范围内');
    await this.prisma.traceCode.update({ where: { code }, data: { status } });
    return buildFreezeResponse(code, status);
  }
}
