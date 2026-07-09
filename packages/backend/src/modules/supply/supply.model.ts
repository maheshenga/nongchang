import { Prisma } from '@prisma/client';
import type { CreateSupplyInput, IssueSupplyInput, SupplyIssueResponse, SupplyItem } from '@nongchang/shared';

export const LOW_STOCK_THRESHOLD = 10;
export const DEFAULT_SUPPLY_LIST_CAP = 500;

type DecimalLike = Prisma.Decimal | number;
const dec = (value: DecimalLike) => new Prisma.Decimal(value);

export interface SupplyRow {
  id: string;
  name: string;
  unit: string;
  total: Prisma.Decimal | number;
  used: Prisma.Decimal | number;
  createdAt: Date;
}

export function toSupplyItem(row: SupplyRow): SupplyItem {
  const remaining = dec(row.total).minus(row.used);
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    total: dec(row.total).toNumber(),
    used: dec(row.used).toNumber(),
    remaining: remaining.toNumber(),
    alert: remaining.lessThan(LOW_STOCK_THRESHOLD),
    createdAt: row.createdAt.toISOString(),
  };
}

export function buildSupplyCreateData(input: { tenantId: string; ownerId: string; input: CreateSupplyInput }) {
  return {
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    name: input.input.name,
    unit: input.input.unit,
    total: input.input.amount,
    used: 0,
  };
}

export function buildSupplyIssueUpdate(input: { supplyId: string; total: Prisma.Decimal | number; amount: number }) {
  return {
    where: { id: input.supplyId, used: { lte: dec(input.total).minus(input.amount) } },
    data: { used: { increment: input.amount } },
  };
}

export function buildSupplyIssueCreateData(input: {
  tenantId: string;
  ownerId: string;
  supplyId: string;
  batchId: string;
  issue: IssueSupplyInput;
}) {
  return {
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    supplyId: input.supplyId,
    batchId: input.batchId,
    amount: input.issue.amount,
    unitPrice: input.issue.unitPrice ?? 0,
  };
}

export function toSupplyIssueResponse(
  supplyId: string,
  row: { total: Prisma.Decimal | number; used: Prisma.Decimal | number },
): SupplyIssueResponse {
  return {
    supplyId,
    used: dec(row.used).toNumber(),
    remaining: dec(row.total).minus(row.used).toNumber(),
  };
}
