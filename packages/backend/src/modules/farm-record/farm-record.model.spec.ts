import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { Role, type AuthUser, type CreateFarmRecordDto } from '@nongchang/shared';
import {
  FARM_RECORD_LIST_ORDER_BY,
  FARM_RECORD_OWNER_BATCH_SELECT,
  FARM_RECORD_OWNER_SELECT,
  FARM_RECORD_OPERATOR_SELECT,
  assertSupplyQuotaWithinLimit,
  buildFarmRecordListFindManyArgs,
  buildFarmRecordListWhere,
  buildFarmRecordCreateData,
  buildFarmRecordOwnerBatchWhere,
  buildFarmRecordOwnerWhere,
  buildFarmRecordOperatorWhere,
  enrichFarmRecordRows,
  getFarmRecordBatchIds,
  getFarmRecordOwnerIds,
  getFarmRecordOperatorIds,
  serializeFarmRecord,
  shouldApplySupplyQuota,
  toPaginatedFarmRecords,
} from './farm-record.model';

const dto: CreateFarmRecordDto = {
  batchId: 'b1',
  fieldId: 'f1',
  action: 'fertilize',
  recordedAt: '2026-01-02T00:00:00.000Z',
  source: 'manual',
};

const actor = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  userId: 'u1',
  tenantId: 't1',
  role: Role.MERCHANT,
  ownerId: 'm1',
  agentId: null,
  ...overrides,
});

describe('farm record model helpers', () => {
  it('serializes supplyAmount Decimal to number without mutating the source row', () => {
    const row = { id: 'r1', supplyAmount: new Prisma.Decimal('12.5') };
    const out = serializeFarmRecord(row);

    expect(out).toEqual({ id: 'r1', supplyAmount: 12.5 });
    expect(row.supplyAmount).toBeInstanceOf(Prisma.Decimal);
  });

  it('keeps null supplyAmount as null', () => {
    expect(serializeFarmRecord({ id: 'r1', supplyAmount: null })).toEqual({ id: 'r1', supplyAmount: null });
  });

  it('builds create data with defaults and optional payload fallbacks', () => {
    expect(buildFarmRecordCreateData({ tenantId: 't1', operatorId: 'op1', dto })).toEqual({
      tenantId: 't1',
      batchId: 'b1',
      fieldId: 'f1',
      operatorId: 'op1',
      action: 'fertilize',
      detail: undefined,
      images: undefined,
      location: null,
      recordedAt: new Date('2026-01-02T00:00:00.000Z'),
      source: 'manual',
      status: 'completed',
      supplyId: undefined,
      supplyAmount: undefined,
    });
  });

  it('builds create data with explicit status and supply fields', () => {
    const out = buildFarmRecordCreateData({
      tenantId: 't1',
      operatorId: 'op1',
      dto: {
        ...dto,
        status: 'pending',
        detail: { weather: 'sunny' },
        images: ['a.png'],
        location: 'field-a',
        supplyId: 's1',
        supplyAmount: 0,
      },
    });

    expect(out.status).toBe('pending');
    expect(out.detail).toEqual({ weather: 'sunny' });
    expect(out.images).toEqual(['a.png']);
    expect(out.location).toBe('field-a');
    expect(out.supplyId).toBe('s1');
    expect(out.supplyAmount).toBe(0);
  });

  it('detects quota path only when supplyId exists and supplyAmount is not nullish', () => {
    expect(shouldApplySupplyQuota({ supplyId: 's1', supplyAmount: 0 })).toBe(true);
    expect(shouldApplySupplyQuota({ supplyId: 's1', supplyAmount: 1 })).toBe(true);
    expect(shouldApplySupplyQuota({ supplyId: 's1' })).toBe(false);
    expect(shouldApplySupplyQuota({ supplyAmount: 1 })).toBe(false);
    expect(shouldApplySupplyQuota({ supplyId: '', supplyAmount: 1 })).toBe(false);
  });

  it('allows usage up to 110 percent of issued quota and rejects beyond it', () => {
    expect(() => assertSupplyQuotaWithinLimit({ quota: 100, consumed: 90, requested: 20 })).not.toThrow();
    expect(() => assertSupplyQuotaWithinLimit({ quota: 100, consumed: 90, requested: 20.01 })).toThrow('实际用量超过领用配额 110%,核销熔断');
  });

  it('enriches rows with owner names through batch owner mapping', () => {
    const out = enrichFarmRecordRows(
      [{ id: 'r1', batchId: 'b1', operatorId: 'op1', supplyAmount: new Prisma.Decimal('2.5') }],
      [{ id: 'b1', ownerId: 'm1' }],
      [{ id: 'm1', displayName: 'Merchant A' }],
      [{ id: 'op1', displayName: 'Operator A' }],
    );

    expect(out).toEqual([{
      id: 'r1', batchId: 'b1', operatorId: 'op1', supplyAmount: 2.5,
      ownerName: 'Merchant A', operatorName: 'Operator A',
    }]);
  });

  it('uses null friendly names when related users are missing', () => {
    const out = enrichFarmRecordRows([{ id: 'r1', batchId: 'b1', operatorId: 'op1', supplyAmount: null }], [], [], []);

    expect(out).toEqual([{
      id: 'r1', batchId: 'b1', operatorId: 'op1', supplyAmount: null,
      ownerName: null, operatorName: null,
    }]);
  });
});

describe('farm record list model helpers', () => {
  it('builds scoped list filters from batch, action, and status query fields', () => {
    expect(buildFarmRecordListWhere(actor(), {
      batchId: 'b1',
      action: 'water',
      status: 'completed',
      page: 2,
      pageSize: 10,
    })).toEqual({
      tenantId: 't1',
      batchId: 'b1',
      action: { contains: 'water', mode: 'insensitive' },
      status: 'completed',
    });

    expect(buildFarmRecordListWhere(actor(), {
      page: 1,
      pageSize: 20,
    }, { owner: { is: { tenantId: 't1', agentId: 'a1' } } })).toEqual({
      tenantId: 't1',
      batch: { is: { owner: { is: { tenantId: 't1', agentId: 'a1' } } } },
    });
  });

  it('builds paginated farm record findMany args with stable ordering', () => {
    const where = buildFarmRecordListWhere(actor(), {
      page: 3,
      pageSize: 15,
    }, { ownerId: 'm1' });

    expect(buildFarmRecordListFindManyArgs(where, { page: 3, pageSize: 15 })).toEqual({
      where,
      orderBy: FARM_RECORD_LIST_ORDER_BY,
      skip: 30,
      take: 15,
    });
  });

  it('builds owner lookup filters from listed farm record rows', () => {
    const rows = [
      { id: 'r1', batchId: 'b1', supplyAmount: null },
      { id: 'r2', batchId: 'b1', supplyAmount: null },
      { id: 'r3', batchId: 'b2', supplyAmount: null },
    ];
    const batches = [
      { id: 'b1', ownerId: 'm1' },
      { id: 'b2', ownerId: 'm2' },
      { id: 'b3', ownerId: 'm1' },
    ];

    expect(getFarmRecordBatchIds(rows)).toEqual(['b1', 'b2']);
    expect(buildFarmRecordOwnerBatchWhere(rows)).toEqual({
      where: { id: { in: ['b1', 'b2'] } },
      select: FARM_RECORD_OWNER_BATCH_SELECT,
    });
    expect(getFarmRecordOwnerIds(batches)).toEqual(['m1', 'm2']);
    expect(buildFarmRecordOwnerWhere(batches)).toEqual({
      where: { id: { in: ['m1', 'm2'] } },
      select: FARM_RECORD_OWNER_SELECT,
    });
    expect(buildFarmRecordOwnerBatchWhere([])).toBeNull();
    expect(buildFarmRecordOwnerWhere([])).toBeNull();
    const operatorRows = [{ operatorId: 'op1' }, { operatorId: 'op1' }, { operatorId: 'op2' }];
    expect(getFarmRecordOperatorIds(operatorRows)).toEqual(['op1', 'op2']);
    expect(buildFarmRecordOperatorWhere(operatorRows)).toEqual({
      where: { id: { in: ['op1', 'op2'] } },
      select: FARM_RECORD_OPERATOR_SELECT,
    });
    expect(buildFarmRecordOperatorWhere([])).toBeNull();
  });

  it('builds paginated farm record envelopes', () => {
    const items = [{ id: 'r1', batchId: 'b1', supplyAmount: null, ownerName: null }];

    expect(toPaginatedFarmRecords(items, 7, { page: 2, pageSize: 3 })).toEqual({
      items,
      total: 7,
      page: 2,
      pageSize: 3,
    });
  });
});
