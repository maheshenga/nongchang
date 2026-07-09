import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateFarmRecordDto } from '@nongchang/shared';

export function serializeFarmRecord<T extends { supplyAmount: Prisma.Decimal | number | null }>(record: T) {
  return { ...record, supplyAmount: record.supplyAmount != null ? new Prisma.Decimal(record.supplyAmount).toNumber() : null };
}

export function buildFarmRecordCreateData(input: { tenantId: string; operatorId: string; dto: CreateFarmRecordDto }) {
  return {
    tenantId: input.tenantId,
    batchId: input.dto.batchId,
    fieldId: input.dto.fieldId,
    operatorId: input.operatorId,
    action: input.dto.action,
    detail: (input.dto.detail ?? undefined) as Prisma.InputJsonValue | undefined,
    images: (input.dto.images ?? undefined) as Prisma.InputJsonValue | undefined,
    location: input.dto.location ?? null,
    recordedAt: new Date(input.dto.recordedAt),
    source: input.dto.source,
    status: input.dto.status ?? 'completed',
    supplyId: input.dto.supplyId ?? undefined,
    supplyAmount: input.dto.supplyAmount ?? undefined,
  };
}

export function shouldApplySupplyQuota(dto: Pick<CreateFarmRecordDto, 'supplyId' | 'supplyAmount'>): boolean {
  return Boolean(dto.supplyId && dto.supplyAmount != null);
}

export function assertSupplyQuotaWithinLimit(input: {
  quota: Prisma.Decimal | number;
  consumed: Prisma.Decimal | number;
  requested: Prisma.Decimal | number;
}): void {
  const quota = new Prisma.Decimal(input.quota);
  const consumed = new Prisma.Decimal(input.consumed);
  if (consumed.plus(input.requested).greaterThan(quota.times(1.1))) {
    throw new BadRequestException('实际用量超过领用配额 110%,核销熔断');
  }
}

export function enrichFarmRecordRows(items: any[], batches: any[], owners: any[]) {
  const batchOwner = new Map(batches.map((batch: any) => [batch.id, batch.ownerId]));
  const nameMap = new Map(owners.map((owner: any) => [owner.id, owner.displayName]));
  return items.map((record: any) => ({
    ...serializeFarmRecord(record),
    ownerName: nameMap.get(batchOwner.get(record.batchId) as string) ?? null,
  }));
}
