import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const okResp = (data: unknown) => ({ statusCode: 200, data });

// 因 config/env.ts 在模块加载时读取 process.env.TARO_APP_WX_APPID,
// 每个用例先 resetModules + stubEnv,再动态 import,确保 taro mock 与 auth 共享同一新实例。
async function loadFresh(appId: string) {
  vi.resetModules();
  vi.stubEnv('TARO_APP_WX_APPID', appId);
  const taro = (await import('@tarojs/taro')).default as any;
  const auth = await import('./auth');
  return { taro, auth };
}

describe('api/auth loginWechat', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('throws when WX_APPID is not configured', async () => {
    const { taro, auth } = await loadFresh('');
    await expect(auth.loginWechat()).rejects.toThrow('未配置微信 AppID');
    expect(taro.login).not.toHaveBeenCalled();
  });

  it('calls Taro.login, posts appId+code, stores token', async () => {
    const { taro, auth } = await loadFresh('wx_test_appid');
    taro.login.mockResolvedValue({ code: 'jscode_123' });
    taro.request.mockResolvedValue(okResp({ accessToken: 'at_1', refreshToken: 'rt_1' }));

    await auth.loginWechat();

    const arg = taro.request.mock.calls[0][0];
    expect(arg.url).toMatch(/\/auth\/wechat$/);
    expect(arg.method).toBe('POST');
    expect(arg.data).toEqual({ appId: 'wx_test_appid', code: 'jscode_123' });
    expect(taro.setStorageSync).toHaveBeenCalledWith('access_token', 'at_1');
  });

  it('throws when Taro.login returns no code', async () => {
    const { taro, auth } = await loadFresh('wx_test_appid');
    taro.login.mockResolvedValue({ code: '' });

    await expect(auth.loginWechat()).rejects.toThrow('微信登录失败');
    expect(taro.request).not.toHaveBeenCalled();
  });
});
