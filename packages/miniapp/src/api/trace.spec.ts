import { describe, it, expect, beforeEach } from 'vitest';
import taro from '@tarojs/taro';
import { listTraceEvents } from './trace';
import { setTokens } from '../store/auth';

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

describe('api/trace', () => {
  beforeEach(() => {
    (taro as any).__reset();
    setTokens({
      accessToken: makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      refreshToken: 'refresh-trace',
    });
  });
  it('GETs /trace/events/:batchId', async () => {
    (taro.request as any).mockResolvedValue({ statusCode: 200, data: [{ type: 'origin', title: '播种' }] });
    const out = await listTraceEvents('b1');
    expect(out).toHaveLength(1);
    expect((taro.request as any).mock.calls[0][0].url).toMatch(/\/trace\/events\/b1$/);
  });
});
