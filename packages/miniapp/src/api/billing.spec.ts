import Taro from '@tarojs/taro';
import { beforeEach, describe, expect, it } from 'vitest';
import { setTokens } from '../store/auth';
import { listLedger } from './billing';

function makeJwt(): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`;
}

describe('miniapp billing API', () => {
  beforeEach(() => {
    (Taro as any).__reset();
    setTokens({ accessToken: makeJwt(), refreshToken: 'refresh-billing' });
  });

  it('serializes ledger filters and pagination', async () => {
    (Taro.request as any).mockResolvedValue({
      statusCode: 200,
      data: { items: [], total: 0, page: 2, pageSize: 20 },
    });

    await listLedger({ resource: 'AI', reason: 'CONSUME', page: 2, pageSize: 20 });

    expect((Taro.request as any).mock.calls[0][0].url)
      .toMatch(/\/billing\/ledger\?resource=AI&reason=CONSUME&page=2&pageSize=20$/);
  });
});
