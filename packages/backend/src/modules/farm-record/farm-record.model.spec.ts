import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { Role, TraceEventType, type AuthUser, type CreateFarmRecordDto } from '@nongchang/shared';
import {
  FARM_RECORD_LIST_ORDER_BY,
  FARM_RECORD_OWNER_BATCH_SELECT,
  FARM_RECORD_OWNER_SELECT,
  assertSupplyQuotaWithinLimit,
  buildFarmRecordListFindManyArgs,
  buildFarmRecordListWhere,
  buildFarmRecordCreateData,
  buildFarmRecordTraceEventData,
  buildFarmRecordOwnerBatchWhere,
  buildFarmRecordOwnerWhere,
  enrichFarmRecordRows,
  getFarmRecordBatchIds,
  getFarmRecordOwnerIds,
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
      [{ id: 'r1', batchId: 'b1', supplyAmount: new Prisma.Decimal('2.5') }],
      [{ id: 'b1', ownerId: 'm1' }],
      [{ id: 'm1', displayName: 'Merchant A' }],
    );

    expect(out).toEqual([{ id: 'r1', batchId: 'b1', supplyAmount: 2.5, ownerName: 'Merchant A' }]);
  });

  it('uses null ownerName when batch or owner is missing', () => {
    const out = enrichFarmRecordRows([{ id: 'r1', batchId: 'b1', supplyAmount: null }], [], []);

    expect(out).toEqual([{ id: 'r1', batchId: 'b1', supplyAmount: null, ownerName: null }]);
  });
});

describe('buildFarmRecordTraceEventData', () => {
  const base = {
    record: {
      id: 'fr1',
      tenantId: 'tenant1',
      batchId: 'batch1',
      action: '  fertilize  ',
      detail: { note: '  leaf feeding completed  ', cost: 200, labor: 3, material: 'internal formula' },
      images: ['https://cdn.example/farm-1.jpg', 'https://cdn.example/farm-2.jpg'],
      recordedAt: new Date('2026-07-17T01:02:03.000Z'),
    },
    ownerDisplayName: 'Demo Farm',
    fieldName: 'Field One',
  };

  it('maps a completed record to the public farm-event allowlist', () => {
    expect(buildFarmRecordTraceEventData(base)).toEqual({
      tenantId: 'tenant1',
      batchId: 'batch1',
      type: TraceEventType.FARM,
      title: 'fertilize',
      actor: 'Demo Farm',
      location: 'Field One',
      occurredAt: new Date('2026-07-17T01:02:03.000Z'),
      payload: { desc: 'leaf feeding completed', image: 'https://cdn.example/farm-1.jpg' },
      sourceFarmRecordId: 'fr1',
    });
  });

  it('supports web detail.desc and excludes private or unknown fields', () => {
    const result = buildFarmRecordTraceEventData({
      ...base,
      record: {
        ...base.record,
        detail: { desc: 'weeding completed', cost: 99, labor: 8, supplyId: 'hidden', extra: 'hidden' },
        images: [],
      },
    });

    expect(result.payload).toEqual({ desc: 'weeding completed' });
    const publicJson = JSON.stringify(result);
    expect(publicJson).not.toContain('cost');
    expect(publicJson).not.toContain('labor');
    expect(publicJson).not.toContain('supplyId');
    expect(publicJson).not.toContain('extra');
  });

  it('uses no payload when no public description or valid image exists', () => {
    expect(buildFarmRecordTraceEventData({
      ...base,
      record: { ...base.record, detail: { cost: 1 }, images: [1, null] },
    }).payload).toBeUndefined();
  });

  it('trims descriptions to 2000 Unicode code points', () => {
    const desc = `${'a'.repeat(2000)}tail`;
    const result = buildFarmRecordTraceEventData({
      ...base,
      record: { ...base.record, detail: { note: desc }, images: null },
    });

    expect(Array.from((result.payload as { desc: string }).desc)).toHaveLength(2000);
    expect((result.payload as { desc: string }).desc.endsWith('tail')).toBe(false);
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
    }, ['b1', 'b2'])).toEqual({
      tenantId: 't1',
      batchId: { in: ['b1', 'b2'] },
    });
  });

  it('builds paginated farm record findMany args with stable ordering', () => {
    const where = buildFarmRecordListWhere(actor(), {
      page: 3,
      pageSize: 15,
    }, ['b1']);

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
