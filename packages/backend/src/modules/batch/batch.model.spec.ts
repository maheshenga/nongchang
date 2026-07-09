import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { BatchStatus, type CreateBatchDto } from '@nongchang/shared';
import {
  BATCH_STATUS_ORDER,
  DEFAULT_BATCH_LIST_CAP,
  assertBatchStatusProgression,
  buildBatchCostUpdateData,
  buildBatchCreateData,
  enrichBatchRows,
  serializeBatch,
} from './batch.model';

const dto: CreateBatchDto = {
  ownerId: 'ignored',
  fieldId: 'f1',
  batchNo: 'B1',
  cropName: 'Rice',
  plantDate: '2026-01-01T00:00:00.000Z',
  expectedHarvest: '2026-06-01T00:00:00.000Z',
  status: BatchStatus.PLANTING,
};

describe('batch model helpers', () => {
  it('keeps batch list cap and lifecycle status order stable', () => {
    expect(DEFAULT_BATCH_LIST_CAP).toBe(500);
    expect(BATCH_STATUS_ORDER).toEqual([
      BatchStatus.PLANTING,
      BatchStatus.GROWING,
      BatchStatus.HARVESTED,
      BatchStatus.DISTRIBUTED,
    ]);
  });

  it('serializes decimal money fields without mutating the source row', () => {
    const row = {
      id: 'b1',
      laborCost: new Prisma.Decimal('12.50'),
      sellPrice: new Prisma.Decimal('30.25'),
      cropName: 'Rice',
    };

    const serialized = serializeBatch(row);

    expect(serialized).toEqual({ id: 'b1', laborCost: 12.5, sellPrice: 30.25, cropName: 'Rice' });
    expect(row.laborCost).toBeInstanceOf(Prisma.Decimal);
  });

  it('returns null batch rows unchanged', () => {
    expect(serializeBatch(null)).toBeNull();
  });

  it('builds create data with resolved owner and Date values', () => {
    expect(buildBatchCreateData({ tenantId: 't1', ownerId: 'm1', dto })).toEqual({
      tenantId: 't1',
      ownerId: 'm1',
      fieldId: 'f1',
      batchNo: 'B1',
      cropName: 'Rice',
      plantDate: new Date('2026-01-01T00:00:00.000Z'),
      expectedHarvest: new Date('2026-06-01T00:00:00.000Z'),
      status: BatchStatus.PLANTING,
    });
  });

  it('builds sparse cost update data and preserves zero values', () => {
    expect(buildBatchCostUpdateData({ laborCost: 0 })).toEqual({ laborCost: 0 });
    expect(buildBatchCostUpdateData({ sellPrice: 200 })).toEqual({ sellPrice: 200 });
    expect(buildBatchCostUpdateData({ laborCost: 100, sellPrice: 200 })).toEqual({ laborCost: 100, sellPrice: 200 });
    expect(buildBatchCostUpdateData({})).toEqual({});
  });

  it('allows forward status jumps and rejects same/backward transitions', () => {
    expect(() => assertBatchStatusProgression(BatchStatus.PLANTING, BatchStatus.GROWING)).not.toThrow();
    expect(() => assertBatchStatusProgression(BatchStatus.PLANTING, BatchStatus.HARVESTED)).not.toThrow();
    expect(() => assertBatchStatusProgression(BatchStatus.GROWING, BatchStatus.GROWING)).toThrow('非法的状态流转');
    expect(() => assertBatchStatusProgression(BatchStatus.HARVESTED, BatchStatus.GROWING)).toThrow('非法的状态流转');
  });

  it('enriches list rows with owner, trace counts, scan total, and input cost', () => {
    const out = enrichBatchRows(
      [{ id: 'b1', ownerId: 'm1', laborCost: 0, sellPrice: 0 }],
      [{ batchId: 'b1', _count: { _all: 3 }, _sum: { scanCount: 12 } }],
      [
        { batchId: 'b1', amount: 10, unitPrice: 5 },
        { batchId: 'b1', amount: 2, unitPrice: 3 },
      ],
      [{ id: 'm1', displayName: 'Merchant A' }],
    );

    expect(out).toEqual([
      {
        id: 'b1',
        ownerId: 'm1',
        laborCost: 0,
        sellPrice: 0,
        ownerName: 'Merchant A',
        codeCount: 3,
        scanTotal: 12,
        inputCost: 56,
      },
    ]);
  });

  it('uses null/zero defaults when enrichment data is missing', () => {
    const out = enrichBatchRows([{ id: 'b1', ownerId: 'm1', laborCost: 0, sellPrice: 0 }], [], [], []);

    expect(out[0].ownerName).toBeNull();
    expect(out[0].codeCount).toBe(0);
    expect(out[0].scanTotal).toBe(0);
    expect(out[0].inputCost).toBe(0);
  });
});
