import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { CreateFarmRecordDto } from '@nongchang/shared';
import {
  assertSupplyQuotaWithinLimit,
  buildFarmRecordCreateData,
  enrichFarmRecordRows,
  serializeFarmRecord,
  shouldApplySupplyQuota,
} from './farm-record.model';

const dto: CreateFarmRecordDto = {
  batchId: 'b1',
  fieldId: 'f1',
  action: 'fertilize',
  recordedAt: '2026-01-02T00:00:00.000Z',
  source: 'manual',
};

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
