import { beforeEach, describe, expect, it } from 'vitest';
import taro from '@tarojs/taro';
import { TraceEventType } from '@nongchang/shared';
import { listTraceEvents } from './trace';
import { setTokens } from '../store/auth';

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

const event = {
  id: 'event-1', tenantId: 'tenant-1', batchId: 'batch-1', type: TraceEventType.ORIGIN,
  title: 'Planting', actor: 'Operator', location: 'Field A', occurredAt: '2026-07-13T00:00:00.000Z',
  payload: null, createdAt: '2026-07-13T00:00:00.000Z',
};

describe('api/trace response contracts', () => {
  beforeEach(() => {
    (taro as any).__reset();
    setTokens({
      accessToken: makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      refreshToken: 'refresh-trace',
    });
  });

  it('parses trace events returned by the API', async () => {
    (taro.request as any).mockResolvedValue({ statusCode: 200, data: [event] });
    await expect(listTraceEvents('batch-1')).resolves.toEqual([event]);
    expect((taro.request as any).mock.calls[0][0].url).toMatch(/\/trace\/events\/batch-1$/);
  });

  it('rejects trace events without ids', async () => {
    (taro.request as any).mockResolvedValue({ statusCode: 200, data: [{ ...event, id: undefined }] });
    await expect(listTraceEvents('batch-1')).rejects.toThrow();
  });
});
