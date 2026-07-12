import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser, CreateFarmRecordDto, FarmRecordQueryDto, PaginatedFarmRecords } from '@nongchang/shared';

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

export const FARM_RECORD_LIST_ORDER_BY = { recordedAt: 'desc' as const };

export const FARM_RECORD_OWNER_BATCH_SELECT = { id: true, ownerId: true } as const;

export const FARM_RECORD_OWNER_SELECT = { id: true, displayName: true } as const;

export interface FarmRecordListRow {
  batchId: string;
  supplyAmount: Prisma.Decimal | number | null;
}

export interface FarmRecordOwnerBatchRow {
  id: string;
  ownerId: string;
}

export interface FarmRecordOwnerRow {
  id: string;
  displayName: string | null;
}

export function buildFarmRecordListWhere(
  user: Pick<AuthUser, 'tenantId'>,
  query: FarmRecordQueryDto,
  batchScope?: Prisma.BatchWhereInput,
): Prisma.FarmRecordWhereInput {
  const where: Prisma.FarmRecordWhereInput = { tenantId: user.tenantId };
  if (query.batchId) where.batchId = query.batchId;
  else {
    if (!batchScope) throw new BadRequestException('缺少批次作用域,拒绝查询农事记录');
    where.batch = { is: batchScope };
  }
  if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
  if (query.status) where.status = query.status;
  return where;
}

export function buildFarmRecordListFindManyArgs(where: Prisma.FarmRecordWhereInput, query: FarmRecordQueryDto) {
  return {
    where,
    orderBy: FARM_RECORD_LIST_ORDER_BY,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

export function getFarmRecordBatchIds(rows: Array<{ batchId: string }>): string[] {
  return [...new Set(rows.map(row => row.batchId))];
}

export function buildFarmRecordOwnerBatchWhere(rows: Array<{ batchId: string }>) {
  const batchIds = getFarmRecordBatchIds(rows);
  if (!batchIds.length) return null;
  return { where: { id: { in: batchIds } }, select: FARM_RECORD_OWNER_BATCH_SELECT };
}

export function getFarmRecordOwnerIds(rows: Array<{ ownerId: string }>): string[] {
  return [...new Set(rows.map(row => row.ownerId))];
}

export function buildFarmRecordOwnerWhere(rows: Array<{ ownerId: string }>) {
  const ownerIds = getFarmRecordOwnerIds(rows);
  if (!ownerIds.length) return null;
  return { where: { id: { in: ownerIds } }, select: FARM_RECORD_OWNER_SELECT };
}

export function toPaginatedFarmRecords<T>(items: T[], total: number, query: FarmRecordQueryDto): PaginatedFarmRecords<T> {
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export function enrichFarmRecordRows(items: any[], batches: any[], owners: any[]) {
  const batchOwner = new Map(batches.map((batch: any) => [batch.id, batch.ownerId]));
  const nameMap = new Map(owners.map((owner: any) => [owner.id, owner.displayName]));
  return items.map((record: any) => ({
    ...serializeFarmRecord(record),
    ownerName: nameMap.get(batchOwner.get(record.batchId) as string) ?? null,
  }));
}
