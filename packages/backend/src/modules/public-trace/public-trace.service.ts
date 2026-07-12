import { Injectable, NotFoundException } from '@nestjs/common';
import type { PublicTraceResult } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPublicTraceResponse } from './public-trace.model';

@Injectable()
export class PublicTraceService {
  constructor(private prisma: PrismaService) {}

  async getByCode(
    code: string,
    meta?: { ip: string; userAgent: string | null },
  ): Promise<PublicTraceResult> {
    const traceCode = await this.prisma.traceCode.findUnique({ where: { code } });
    if (!traceCode) throw new NotFoundException('溯源码不存在');

    const batch = await this.prisma.batch.findUnique({ where: { id: traceCode.batchId } });
    if (!batch) throw new NotFoundException('批次不存在');
    if (traceCode.status === 'frozen') return { code: traceCode.code, frozen: true };

    const [field, coordinateRows, owner, events, credentials] = await Promise.all([
      this.prisma.field.findUnique({ where: { id: batch.fieldId } }),
      this.prisma.$queryRaw<Array<{ lng: number | null; lat: number | null }>>`
        SELECT ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
        FROM fields
        WHERE id = ${batch.fieldId}
      `,
      this.prisma.user.findUnique({ where: { id: batch.ownerId } }),
      this.prisma.traceEvent.findMany({
        where: { tenantId: traceCode.tenantId, batchId: batch.id },
        orderBy: { occurredAt: 'asc' },
      }),
      this.prisma.traceCredential.findMany({
        where: { tenantId: traceCode.tenantId, batchId: batch.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const fieldLng = coordinateRows[0]?.lng ?? null;
    const fieldLat = coordinateRows[0]?.lat ?? null;
    const [agent, mapConfig] = await Promise.all([
      owner?.agentId
        ? this.prisma.agent.findUnique({ where: { id: owner.agentId } })
        : Promise.resolve(null),
      fieldLng != null && fieldLat != null
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

    const updated = await this.prisma.traceCode.update({
      where: { code },
      data: { scanCount: { increment: 1 } },
    });

    if (meta) {
      try {
        await this.prisma.traceScan.create({
          data: {
            tenantId: traceCode.tenantId,
            code: traceCode.code,
            batchId: batch.id,
            ip: meta.ip,
            userAgent: meta.userAgent,
          },
        });
      } catch {
        // Scan-detail analytics are best-effort and must not roll back the public response.
      }
    }

    return buildPublicTraceResponse({
      code: traceCode.code,
      scanCount: updated.scanCount,
      tiandituKey,
      batch,
      field,
      agent,
      fieldLng,
      fieldLat,
      events,
      credentials,
    });
  }
}
