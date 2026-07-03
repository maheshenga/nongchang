import { describe, it, expect, beforeEach } from 'vitest';
import taro from '@tarojs/taro';
import { findBatchByCode } from './farm';
import { setTokens } from '../store/auth';

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

describe('api/farm findBatchByCode', () => {
  beforeEach(() => {
    (taro as any).__reset();
    setTokens({
      accessToken: makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      refreshToken: 'refresh-farm',
    });
  });

  it('findBatchByCode GET /batches/by-code/:code 返回批次', async () => {
    const batch = { id: 'b1', ownerId: 'm1', fieldId: 'f1', batchNo: 'PA-1', cropName: '白芍', plantDate: '', expectedHarvest: '', status: 'planting' };
    (taro.request as any).mockResolvedValue({ statusCode: 200, data: batch });
    const out = await findBatchByCode('ORC-DEMO0001');
    expect(out).toEqual(batch);
    const arg = (taro.request as any).mock.calls[0][0];
    expect(arg.url).toMatch(/\/batches\/by-code\/ORC-DEMO0001$/);
  });
});
