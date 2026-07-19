import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FarmRecordSource } from '@nongchang/shared';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { createFarmRecord, listFarmRecordsPaged } from './farm-records';

const now = '2026-07-13T00:00:00.000Z';
const record = {
  id: 'record-1', tenantId: 'tenant-1', batchId: 'batch-1', fieldId: 'field-1', operatorId: 'user-1',
  action: 'Fertilize', detail: null, images: null, location: null, recordedAt: now,
  source: FarmRecordSource.WEB, status: 'completed', supplyId: null, supplyAmount: 2.5, createdAt: now,
};

beforeEach(() => requestMock.mockReset());

describe('farm record api response contracts', () => {
  it('parses the paginated envelope and every item', async () => {
    requestMock.mockResolvedValue({ items: [record], total: 1, page: 1, pageSize: 20 });
    await expect(listFarmRecordsPaged()).resolves.toEqual({
      items: [{ ...record, ownerName: null }], total: 1, page: 1, pageSize: 20,
    });
  });

  it('rejects malformed item responses', async () => {
    requestMock.mockResolvedValue({ ...record, id: undefined });
    await expect(createFarmRecord({} as never)).rejects.toThrow();
  });
});
