import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchStatus } from '@nongchang/shared';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { createBatch, getBatchLifecycle, listBatches } from './batches';

const now = '2026-07-13T00:00:00.000Z';
const batch = {
  id: 'batch-1', tenantId: 'tenant-1', ownerId: 'owner-1', fieldId: 'field-1',
  batchNo: 'B-001', cropName: 'Cabbage', plantDate: now, expectedHarvest: now,
  status: BatchStatus.GROWING, laborCost: 10, sellPrice: 20, createdAt: now,
};

beforeEach(() => requestMock.mockReset());

describe('batch api response contracts', () => {
  it('parses list responses and normalizes list-only fields', async () => {
    requestMock.mockResolvedValue([batch]);
    await expect(listBatches()).resolves.toEqual([{
      ...batch,
      ownerName: null,
      codeCount: 0,
      scanTotal: 0,
      inputCost: 0,
    }]);
  });

  it('rejects malformed create responses', async () => {
    requestMock.mockResolvedValue({ ...batch, id: undefined });
    await expect(createBatch({} as never)).rejects.toThrow();
  });

  it('rejects malformed lifecycle resources', async () => {
    requestMock.mockResolvedValue({
      batch: { ...batch, id: undefined },
      farmRecords: [],
      traceEvents: [],
      codeCount: 0,
      scanTotal: 0,
      recentScans: [],
    });
    await expect(getBatchLifecycle('batch-1')).rejects.toThrow();
  });
});
