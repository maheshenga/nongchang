import { Injectable, NotFoundException } from '@nestjs/common';
import type { PublicTraceResult } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPublicTraceResponse } from './public-trace.model';

@Injectable()
export class PublicTraceService {
  constructor(private prisma: PrismaService) {}

  async getByCode(code: string, meta?: { ip: string; userAgent: string | null }): Promise<PublicTraceResult> {
    return this.prisma.$transaction(async (tx) => {
      const traceCode = await tx.traceCode.findUnique({ where: { code } });
      if (!traceCode) throw new NotFoundException('溯源码不存在');

      const batch = await tx.batch.findUnique({ where: { id: traceCode.batchId } });
      if (!batch) throw new NotFoundException('批次不存在');

      if (traceCode.status === 'frozen') {
        return { code: traceCode.code, frozen: true };
      }

      const field = await tx.field.findUnique({ where: { id: batch.fieldId } });
    // 经纬度存 PostGIS geography 列,用 ST_X/ST_Y 提取(无坐标则为 null)。
      let fieldLng: number | null = null;
      let fieldLat: number | null = null;
      if (field) {
        const rows = await tx.$queryRawUnsafe<Array<{ lng: number | null; lat: number | null }>>(
          `SELECT ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat FROM fields WHERE id = $1`,
          field.id,
        );
        fieldLng = rows[0]?.lng ?? null;
        fieldLat = rows[0]?.lat ?? null;
      }
      const owner = await tx.user.findUnique({ where: { id: batch.ownerId } });
      const agent = owner?.agentId
        ? await tx.agent.findUnique({ where: { id: owner.agentId } })
        : null;

      const events = await tx.traceEvent.findMany({
        where: { tenantId: traceCode.tenantId, batchId: batch.id },
        orderBy: { occurredAt: 'asc' },
      });

      const credentials = await tx.traceCredential.findMany({
        where: { tenantId: traceCode.tenantId, batchId: batch.id },
        orderBy: { createdAt: 'desc' },
      });

    // 天地图浏览器端 key(明文存 appId 字段,靠域名白名单防盗用):仅在地块有经纬度且配置启用时返回,供公开溯源页加载底图。
      let tiandituKey: string | null = null;
      if (fieldLng != null && fieldLat != null) {
        const tdt = await tx.integrationConfig.findUnique({
          where: { tenantId_provider: { tenantId: traceCode.tenantId, provider: 'tianditu' } },
        });
        if (tdt?.enabled && tdt.appId) tiandituKey = tdt.appId;
      }

      const updated = await tx.traceCode.update({
        where: { code },
        data: { scanCount: { increment: 1 } },
      });

      if (meta) {
        try {
          await tx.traceScan.create({
            data: {
              tenantId: traceCode.tenantId, code: traceCode.code, batchId: batch.id,
              ip: meta.ip, userAgent: meta.userAgent,
            },
          });
        } catch { /* best-effort:落明细失败不阻断溯源响应 */ }
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
    });
  }
}
