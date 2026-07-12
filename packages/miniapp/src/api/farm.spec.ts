import { beforeEach, describe, expect, it } from 'vitest';
import taro from '@tarojs/taro';
import { BatchStatus, FarmRecordSource } from '@nongchang/shared';
import { findBatchByCode, listFarmRecords, listFields } from './farm';
import { setTokens } from '../store/auth';

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

const now = '2026-07-13T00:00:00.000Z';
const batch = {
  id: 'batch-1', tenantId: 'tenant-1', ownerId: 'owner-1', fieldId: 'field-1',
  batchNo: 'B-001', cropName: 'Cabbage', plantDate: now, expectedHarvest: now,
  status: BatchStatus.PLANTING, laborCost: 0, sellPrice: 0, createdAt: now,
};
const record = {
  id: 'record-1', tenantId: 'tenant-1', batchId: 'batch-1', fieldId: 'field-1', operatorId: 'user-1',
  action: 'Fertilize', detail: null, images: null, location: null, recordedAt: now,
  source: FarmRecordSource.MINIAPP, status: 'completed', supplyId: null, supplyAmount: null, createdAt: now,
};

describe('api/farm response contracts', () => {
  beforeEach(() => {
    (taro as any).__reset();
    setTokens({
      accessToken: makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      refreshToken: 'refresh-farm',
    });
  });

  it('parses a batch returned by trace code lookup', async () => {
    (taro.request as any).mockResolvedValue({ statusCode: 200, data: batch });
    await expect(findBatchByCode('ORC-DEMO0001')).resolves.toEqual({
      ...batch,
      ownerName: null,
      codeCount: 0,
      scanTotal: 0,
      inputCost: 0,
    });
    expect((taro.request as any).mock.calls[0][0].url).toMatch(/\/batches\/by-code\/ORC-DEMO0001$/);
  });

  it('rejects malformed paginated farm record items', async () => {
    (taro.request as any).mockResolvedValue({
      statusCode: 200,
      data: { items: [{ ...record, id: undefined }], total: 1, page: 1, pageSize: 100 },
    });
    await expect(listFarmRecords('batch-1')).rejects.toThrow();
  });

  it('rejects malformed field responses', async () => {
    (taro.request as any).mockResolvedValue({
      statusCode: 200,
      data: [{ tenantId: 'tenant-1', ownerId: 'owner-1', name: 'Field A', area: 12, iotDeviceId: null, createdAt: now }],
    });
    await expect(listFields()).rejects.toThrow();
  });
});
