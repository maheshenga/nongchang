import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BatchStatus, type CreateBatchDto } from '@nongchang/shared';

export const BATCH_STATUS_ORDER = [
  BatchStatus.PLANTING,
  BatchStatus.GROWING,
  BatchStatus.HARVESTED,
  BatchStatus.DISTRIBUTED,
] as const;

export const DEFAULT_BATCH_LIST_CAP = 500;

export function serializeBatch<T extends Record<string, any> | null>(batch: T): T {
  if (!batch) return batch;
  const out: any = { ...batch };
  if (out.laborCost != null) out.laborCost = new Prisma.Decimal(out.laborCost).toNumber();
  if (out.sellPrice != null) out.sellPrice = new Prisma.Decimal(out.sellPrice).toNumber();
  return out;
}

export function buildBatchCreateData(input: { tenantId: string; ownerId: string; dto: CreateBatchDto }) {
  return {
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    fieldId: input.dto.fieldId,
    batchNo: input.dto.batchNo,
    cropName: input.dto.cropName,
    plantDate: new Date(input.dto.plantDate),
    expectedHarvest: new Date(input.dto.expectedHarvest),
    status: input.dto.status,
  };
}

export function buildBatchCostUpdateData(dto: { laborCost?: number; sellPrice?: number }) {
  return {
    ...(dto.laborCost != null ? { laborCost: dto.laborCost } : {}),
    ...(dto.sellPrice != null ? { sellPrice: dto.sellPrice } : {}),
  };
}

export function assertBatchStatusProgression(currentStatus: string, nextStatus: string): void {
  if (BATCH_STATUS_ORDER.indexOf(nextStatus as BatchStatus) <= BATCH_STATUS_ORDER.indexOf(currentStatus as BatchStatus)) {
    throw new BadRequestException('非法的状态流转');
  }
}

export function enrichBatchRows(batches: any[], codeAgg: any[], issues: any[], owners: any[]) {
  const codeMap = new Map(codeAgg.map((c: any) => [c.batchId, { codeCount: c._count._all, scanTotal: c._sum.scanCount ?? 0 }]));
  const nameMap = new Map(owners.map((o: any) => [o.id, o.displayName]));
  const costMap = new Map<string, Prisma.Decimal>();
  for (const it of issues as any[]) {
    const add = new Prisma.Decimal(it.amount).times(it.unitPrice);
    costMap.set(it.batchId, (costMap.get(it.batchId) ?? new Prisma.Decimal(0)).plus(add));
  }
  return batches.map((batch: any) => ({
    ...batch,
    laborCost: new Prisma.Decimal(batch.laborCost).toNumber(),
    sellPrice: new Prisma.Decimal(batch.sellPrice).toNumber(),
    ownerName: nameMap.get(batch.ownerId) ?? null,
    codeCount: codeMap.get(batch.id)?.codeCount ?? 0,
    scanTotal: codeMap.get(batch.id)?.scanTotal ?? 0,
    inputCost: (costMap.get(batch.id) ?? new Prisma.Decimal(0)).toNumber(),
  }));
}
