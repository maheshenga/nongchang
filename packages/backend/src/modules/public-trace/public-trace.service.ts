import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  PUBLIC_TRACE_CREDENTIAL_LIMIT,
  PUBLIC_TRACE_EVENT_LIMIT,
  DEFAULT_TENANT_SETTINGS,
  type PublicTraceResult,
} from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicTraceCacheService } from './public-trace-cache.service';
import { buildPublicTraceResponse, projectPublicCoordinates } from './public-trace.model';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';

@Injectable()
export class PublicTraceService {
  constructor(
    private prisma: PrismaService,
    @Optional() private cache: PublicTraceCacheService = new PublicTraceCacheService(),
    @Optional() private settings: Pick<TenantSettingsService, 'getByTenantId'> = {
      getByTenantId: async () => DEFAULT_TENANT_SETTINGS,
    },
  ) {}

  private async recordPublicScan(
    traceCode: { tenantId: string; code: string; batchId: string },
    meta?: { ip: string; userAgent: string | null },
  ): Promise<number> {
    if (!meta) {
      const updated = await this.prisma.traceCode.update({
        where: { code: traceCode.code },
        data: { scanCount: { increment: 1 } },
        select: { scanCount: true },
      });
      return updated.scanCount;
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.traceScan.create({
        data: {
          tenantId: traceCode.tenantId,
          code: traceCode.code,
          batchId: traceCode.batchId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      const updated = await tx.traceCode.update({
        where: { code: traceCode.code },
        data: { scanCount: { increment: 1 } },
        select: { scanCount: true },
      });
      return updated.scanCount;
    });
  }

  async getByCode(
    code: string,
    meta?: { ip: string; userAgent: string | null },
  ): Promise<PublicTraceResult> {
    const traceCode = await this.prisma.traceCode.findUnique({ where: { code } });
    if (!traceCode) throw new NotFoundException('溯源码不存在');
    if (traceCode.status === 'frozen') return { code: traceCode.code, frozen: true };

    let response = await this.cache.get(code);
    if (!response) {
      const batch = await this.prisma.batch.findUnique({ where: { id: traceCode.batchId } });
      if (!batch) throw new NotFoundException('批次不存在');
      const where = { tenantId: traceCode.tenantId, batchId: batch.id };
      const tenantSettings = await this.settings.getByTenantId(traceCode.tenantId);
      const [field, coordinateRows, owner, events, eventTotal, credentials, credentialTotal] = await Promise.all([
        this.prisma.field.findUnique({ where: { id: batch.fieldId } }),
        tenantSettings.publicCoordinateMode === 'hidden'
          ? Promise.resolve([])
          : this.prisma.$queryRaw<Array<{ lng: number | null; lat: number | null }>>`
              SELECT ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
              FROM fields
              WHERE id = ${batch.fieldId}
            `,
        this.prisma.user.findUnique({ where: { id: batch.ownerId } }),
        this.prisma.traceEvent.findMany({
          where, orderBy: { occurredAt: 'asc' }, take: PUBLIC_TRACE_EVENT_LIMIT,
        }),
        this.prisma.traceEvent.count({ where }),
        this.prisma.traceCredential.findMany({
          where, orderBy: { createdAt: 'desc' }, take: PUBLIC_TRACE_CREDENTIAL_LIMIT,
        }),
        this.prisma.traceCredential.count({ where }),
      ]);

      const projectedCoordinates = projectPublicCoordinates(
        tenantSettings.publicCoordinateMode,
        coordinateRows[0]?.lng ?? null,
        coordinateRows[0]?.lat ?? null,
      );
      const [agent, mapConfig] = await Promise.all([
        owner?.agentId
          ? this.prisma.agent.findUnique({ where: { id: owner.agentId } })
          : Promise.resolve(null),
        projectedCoordinates.fieldLng != null && projectedCoordinates.fieldLat != null
          ? this.prisma.integrationConfig.findUnique({
              where: {
                tenantId_provider: {
                  tenantId: traceCode.tenantId,
                  provider: 'tianditu',
                },
              },
            })
          : Promise.resolve(null),
      ]);
      const tiandituKey = mapConfig?.enabled && mapConfig.appId ? mapConfig.appId : null;
      response = buildPublicTraceResponse({
        code: traceCode.code,
        scanCount: traceCode.scanCount,
        tiandituKey,
        batch,
        field,
        agent,
        fieldLng: projectedCoordinates.fieldLng,
        fieldLat: projectedCoordinates.fieldLat,
        events,
        eventTotal,
        credentials,
        credentialTotal,
      });
      await this.cache.set(code, traceCode.tenantId, traceCode.batchId, response);
    }

    const scanCount = await this.recordPublicScan(traceCode, meta);
    return { ...response, scanCount };
  }
}
