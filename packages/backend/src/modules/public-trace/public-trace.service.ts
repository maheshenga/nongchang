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
    const owner = await this.prisma.user.findUnique({ where: { id: batch.ownerId } });
    const agent = owner?.agentId
      ? await this.prisma.agent.findUnique({ where: { id: owner.agentId } })
      : null;

    const events = await this.prisma.traceEvent.findMany({
      where: { tenantId: traceCode.tenantId, batchId: batch.id },
      orderBy: { occurredAt: 'asc' },
    });

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
      batch: {
        cropName: batch.cropName,
        batchNo: batch.batchNo,
        plantDate: batch.plantDate.toISOString(),
        expectedHarvest: batch.expectedHarvest.toISOString(),
        status: batch.status as Extract<PublicTraceResult, { frozen: false }>['batch']['status'],
        fieldName: field?.name ?? '',
        region: agent?.region ?? null,
      },
      events: events.map((e) => ({
        type: e.type as Extract<PublicTraceResult, { frozen: false }>['events'][number]['type'],
        title: e.title,
        actor: e.actor,
        location: e.location,
        occurredAt: e.occurredAt.toISOString(),
        payload: (e.payload as Record<string, unknown> | null) ?? null,
      })),
    };
  }
}
