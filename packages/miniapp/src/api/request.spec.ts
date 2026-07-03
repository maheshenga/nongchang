import { describe, it, expect, beforeEach } from 'vitest';
import taro from '@tarojs/taro';
import { request, uploadFile } from './request';
import { getRefreshToken, getToken, setToken, setTokens } from '../store/auth';

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

describe('api/request', () => {
  beforeEach(() => (taro as any).__reset());

  it('refreshes an expired access token and retries the original request', async () => {
    setTokens({
      accessToken: makeJwt({ exp: 1 }),
      refreshToken: 'refresh-1',
    });
    const freshAccess = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    (taro.request as any)
      .mockResolvedValueOnce({
        statusCode: 200,
        data: { accessToken: freshAccess, refreshToken: 'refresh-2' },
      })
      .mockResolvedValueOnce({ statusCode: 200, data: { ok: true } });

    const out = await request<{ ok: true }>({ url: '/fields' });

    expect(out).toEqual({ ok: true });
    expect((taro.request as any).mock.calls[0][0]).toMatchObject({
      url: expect.stringMatching(/\/auth\/refresh$/),
      method: 'POST',
      data: { refreshToken: 'refresh-1' },
    });
    expect((taro.request as any).mock.calls[1][0].header.Authorization).toBe(`Bearer ${freshAccess}`);
  });

  it('does not redirect when an unauthenticated auth request returns 401', async () => {
    (taro.request as any).mockResolvedValueOnce({
      statusCode: 401,
      data: { message: '账号或密码错误' },
    });

    await expect(request({ url: '/auth/login', method: 'POST', auth: false })).rejects.toThrow('账号或密码错误');
    expect(taro.redirectTo).not.toHaveBeenCalled();
    expect((taro.request as any).mock.calls[0][0].header.Authorization).toBeUndefined();
  });

  it('coalesces concurrent refreshes for expired access tokens', async () => {
    setTokens({
      accessToken: makeJwt({ exp: 1 }),
      refreshToken: 'refresh-concurrent-1',
    });
    const freshAccess = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    let resolveRefresh!: () => void;
    (taro.request as any).mockImplementation((opts: any) => {
      if (opts.url.endsWith('/auth/refresh')) {
        return new Promise((resolve) => {
          resolveRefresh = () => resolve({
            statusCode: 200,
            data: { accessToken: freshAccess, refreshToken: 'refresh-concurrent-2' },
          });
        });
      }
      return Promise.resolve({ statusCode: 200, data: { url: opts.url } });
    });

    const first = request<{ url: string }>({ url: '/batches' });
    const second = request<{ url: string }>({ url: '/farm-records' });
    await Promise.resolve();

    expect((taro.request as any).mock.calls.filter((call: any[]) => call[0].url.endsWith('/auth/refresh'))).toHaveLength(1);

    resolveRefresh();
    const out = await Promise.all([first, second]);

    expect(out.map((item) => item.url)).toEqual(expect.arrayContaining([
      expect.stringMatching(/\/batches$/),
      expect.stringMatching(/\/farm-records$/),
    ]));
    expect((taro.request as any).mock.calls.filter((call: any[]) => call[0].header.Authorization === `Bearer ${freshAccess}`)).toHaveLength(2);
  });

  it('does not let a stale refresh response overwrite a newer session', async () => {
    setTokens({
      accessToken: makeJwt({ exp: 1 }),
      refreshToken: 'old-refresh',
    });
    const newerAccess = makeJwt({ exp: Math.floor(Date.now() / 1000) + 7200, sub: 'new' });
    const staleAccess = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600, sub: 'old' });
    let resolveRefresh!: () => void;
    (taro.request as any).mockImplementation((opts: any) => {
      if (opts.url.endsWith('/auth/refresh')) {
        return new Promise((resolve) => {
          resolveRefresh = () => resolve({
            statusCode: 200,
            data: { accessToken: staleAccess, refreshToken: 'stale-refresh' },
          });
        });
      }
      return Promise.resolve({ statusCode: 200, data: { ok: true } });
    });

    const pending = request<{ ok: true }>({ url: '/fields' });
    await Promise.resolve();
    setTokens({ accessToken: newerAccess, refreshToken: 'new-refresh' });
    resolveRefresh();

    await expect(pending).resolves.toEqual({ ok: true });

    expect(getToken()).toBe(newerAccess);
    expect(getRefreshToken()).toBe('new-refresh');
    expect((taro.request as any).mock.calls.at(-1)[0].header.Authorization).toBe(`Bearer ${newerAccess}`);
  });

  it('does not revive a session when only a refresh token remains', async () => {
    taro.setStorageSync('refresh_token', 'orphan-refresh');

    await expect(request({ url: '/fields' })).rejects.toThrow('登录已失效');

    expect(taro.request).not.toHaveBeenCalled();
    expect(taro.redirectTo).toHaveBeenCalledWith({ url: '/pages/login/index' });
    expect(getRefreshToken()).toBe('');
  });

  it('refreshes an expired access token before uploading a file', async () => {
    setTokens({
      accessToken: makeJwt({ exp: 1 }),
      refreshToken: 'refresh-upload-1',
    });
    const freshAccess = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    (taro.request as any).mockResolvedValueOnce({
      statusCode: 200,
      data: { accessToken: freshAccess, refreshToken: 'refresh-upload-2' },
    });
    (taro.uploadFile as any).mockResolvedValueOnce({
      statusCode: 200,
      data: JSON.stringify({ url: 'https://cdn.example.com/a.jpg' }),
    });

    const out = await uploadFile('/tmp/a.jpg');

    expect(out).toBe('https://cdn.example.com/a.jpg');
    expect((taro.request as any).mock.calls[0][0].url).toMatch(/\/auth\/refresh$/);
    expect((taro.uploadFile as any).mock.calls[0][0].header.Authorization).toBe(`Bearer ${freshAccess}`);
  });

  it('refreshes and retries once when upload returns 401', async () => {
    setTokens({
      accessToken: makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      refreshToken: 'refresh-upload-3',
    });
    const freshAccess = makeJwt({ exp: Math.floor(Date.now() / 1000) + 7200 });
    (taro.uploadFile as any)
      .mockResolvedValueOnce({ statusCode: 401, data: JSON.stringify({ message: 'unauthorized' }) })
      .mockResolvedValueOnce({ statusCode: 200, data: JSON.stringify({ url: 'https://cdn.example.com/b.jpg' }) });
    (taro.request as any).mockResolvedValueOnce({
      statusCode: 200,
      data: { accessToken: freshAccess, refreshToken: 'refresh-upload-4' },
    });

    const out = await uploadFile('/tmp/b.jpg');

    expect(out).toBe('https://cdn.example.com/b.jpg');
    expect(taro.uploadFile).toHaveBeenCalledTimes(2);
    expect((taro.uploadFile as any).mock.calls[1][0].header.Authorization).toBe(`Bearer ${freshAccess}`);
  });

  it('expires the session when upload returns 401 without a refresh token', async () => {
    setToken(makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    (taro.uploadFile as any).mockResolvedValueOnce({
      statusCode: 401,
      data: JSON.stringify({ message: 'unauthorized' }),
    });

    await expect(uploadFile('/tmp/c.jpg')).rejects.toThrow('登录已失效');

    expect(taro.redirectTo).toHaveBeenCalledWith({ url: '/pages/login/index' });
    expect(getToken()).toBe('');
  });

  it('expires the session when upload still returns 401 after refresh', async () => {
    setTokens({
      accessToken: makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      refreshToken: 'refresh-upload-5',
    });
    const freshAccess = makeJwt({ exp: Math.floor(Date.now() / 1000) + 7200 });
    (taro.uploadFile as any)
      .mockResolvedValueOnce({ statusCode: 401, data: JSON.stringify({ message: 'unauthorized' }) })
      .mockResolvedValueOnce({ statusCode: 401, data: JSON.stringify({ message: 'still unauthorized' }) });
    (taro.request as any).mockResolvedValueOnce({
      statusCode: 200,
      data: { accessToken: freshAccess, refreshToken: 'refresh-upload-6' },
    });

    await expect(uploadFile('/tmp/d.jpg')).rejects.toThrow('登录已失效');

    expect(taro.uploadFile).toHaveBeenCalledTimes(2);
    expect(taro.redirectTo).toHaveBeenCalledWith({ url: '/pages/login/index' });
    expect(getToken()).toBe('');
    expect(getRefreshToken()).toBe('');
  });
});
