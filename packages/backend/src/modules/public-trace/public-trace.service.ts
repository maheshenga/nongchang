import { Injectable, NotFoundException } from '@nestjs/common';
import { PublicTraceResult } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PublicTraceService {
  constructor(private prisma: PrismaService) {}

  async getByCode(code: string, meta?: { ip: string; userAgent: string | null }): Promise<PublicTraceResult> {
    const traceCode = await this.prisma.traceCode.findUnique({ where: { code } });
    if (!traceCode) throw new NotFoundException('溯源码不存在');

    if (traceCode.status === 'frozen') {
      return { code: traceCode.code, frozen: true };
    }

    const batch = await this.prisma.batch.findUnique({ where: { id: traceCode.batchId } });
    if (!batch) throw new NotFoundException('批次不存在');

    const field = await this.prisma.field.findUnique({ where: { id: batch.fieldId } });
    // 经纬度存 PostGIS geography 列,用 ST_X/ST_Y 提取(无坐标则为 null)。
    let fieldLng: number | null = null;
    let fieldLat: number | null = null;
    if (field) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ lng: number | null; lat: number | null }>>(
        `SELECT ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat FROM fields WHERE id = $1`,
        field.id,
      );
      fieldLng = rows[0]?.lng ?? null;
      fieldLat = rows[0]?.lat ?? null;
    }
    const owner = await this.prisma.user.findUnique({ where: { id: batch.ownerId } });
    const agent = owner?.agentId
      ? await this.prisma.agent.findUnique({ where: { id: owner.agentId } })
      : null;

    const events = await this.prisma.traceEvent.findMany({
      where: { tenantId: traceCode.tenantId, batchId: batch.id },
      orderBy: { occurredAt: 'asc' },
    });

    const credentials = await this.prisma.traceCredential.findMany({
      where: { tenantId: traceCode.tenantId, batchId: batch.id },
      orderBy: { createdAt: 'desc' },
    });

    // 天地图浏览器端 key(明文存 appId 字段,靠域名白名单防盗用):仅在地块有经纬度且配置启用时返回,供公开溯源页加载底图。
    let tiandituKey: string | null = null;
    if (fieldLng != null && fieldLat != null) {
      const tdt = await this.prisma.integrationConfig.findUnique({
        where: { tenantId_provider: { tenantId: traceCode.tenantId, provider: 'tianditu' } },
      });
      if (tdt?.enabled && tdt.appId) tiandituKey = tdt.appId;
    }

    const updated = await this.prisma.traceCode.update({
      where: { code },
      data: { scanCount: { increment: 1 } },
    });

    if (meta) {
      try {
        await this.prisma.traceScan.create({
          data: {
            tenantId: traceCode.tenantId, code: traceCode.code, batchId: batch.id,
            ip: meta.ip, userAgent: meta.userAgent,
          },
        });
      } catch { /* best-effort:落明细失败不阻断溯源响应 */ }
    }

    return {
      code: traceCode.code,
      frozen: false,
      scanCount: updated.scanCount,
      tiandituKey,
      batch: {
        cropName: batch.cropName,
        batchNo: batch.batchNo,
        plantDate: batch.plantDate.toISOString(),
        expectedHarvest: batch.expectedHarvest.toISOString(),
        status: batch.status as Extract<PublicTraceResult, { frozen: false }>['batch']['status'],
        fieldName: field?.name ?? '',
        region: agent?.region ?? null,
        fieldLng,
        fieldLat,
      },
      events: events.map((e) => ({
        type: e.type as Extract<PublicTraceResult, { frozen: false }>['events'][number]['type'],
        title: e.title,
        actor: e.actor,
        location: e.location,
        occurredAt: e.occurredAt.toISOString(),
        payload: (e.payload as Record<string, unknown> | null) ?? null,
      })),
      credentials: credentials.map((c) => ({
        type: c.type as Extract<PublicTraceResult, { frozen: false }>['credentials'][number]['type'],
        title: c.title,
        issuer: c.issuer,
        issuedAt: c.issuedAt ? c.issuedAt.toISOString() : null,
        fileUrl: c.fileUrl,
      })),
    };
  }
}
