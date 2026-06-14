import { describe, it, expect, beforeEach } from 'vitest';
import taro from '@tarojs/taro';
import { findBatchByCode } from './farm';

describe('api/farm findBatchByCode', () => {
  beforeEach(() => (taro as any).__reset());

  it('findBatchByCode GET /batches/by-code/:code 返回批次', async () => {
    const batch = { id: 'b1', ownerId: 'm1', fieldId: 'f1', batchNo: 'PA-1', cropName: '白芍', plantDate: '', expectedHarvest: '', status: 'planting' };
    (taro.request as any).mockResolvedValue({ statusCode: 200, data: batch });
    const out = await findBatchByCode('ORC-DEMO0001');
    expect(out).toEqual(batch);
    const arg = (taro.request as any).mock.calls[0][0];
    expect(arg.url).toMatch(/\/batches\/by-code\/ORC-DEMO0001$/);
  });
});
