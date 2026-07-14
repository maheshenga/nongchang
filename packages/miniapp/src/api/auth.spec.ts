import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const okResp = (data: unknown) => ({ statusCode: 200, data });
const publicationId = '22222222-2222-4222-8222-222222222222';

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
    await expect(auth.loginWechat(publicationId)).rejects.toThrow('未配置微信 AppID');
    expect(taro.login).not.toHaveBeenCalled();
  });

  it('calls Taro.login, posts appId+code, stores token pair', async () => {
    const { taro, auth } = await loadFresh('wx_test_appid');
    taro.login.mockResolvedValue({ code: 'jscode_123' });
    taro.request.mockResolvedValue(okResp({ accessToken: 'at_1', refreshToken: 'rt_1' }));

    await auth.loginWechat(publicationId);

    const arg = taro.request.mock.calls[0][0];
    expect(arg.url).toMatch(/\/auth\/miniapp\/wechat$/);
    expect(arg.method).toBe('POST');
    expect(arg.data).toEqual({ appId: 'wx_test_appid', code: 'jscode_123', publicationId });
    expect(taro.setStorageSync).toHaveBeenCalledWith('access_token', 'at_1');
    expect(taro.setStorageSync).toHaveBeenCalledWith('refresh_token', 'rt_1');
  });

  it('password login stores token pair', async () => {
    const { taro, auth } = await loadFresh('wx_test_appid');
    taro.request.mockResolvedValue(okResp({ accessToken: 'at_2', refreshToken: 'rt_2' }));

    await auth.login('DEMO', 'merchantA', 'password123', publicationId);

    const arg = taro.request.mock.calls[0][0];
    expect(arg.url).toMatch(/\/auth\/miniapp\/login$/);
    expect(arg.data).toEqual({
      tenantCode: 'DEMO', username: 'merchantA', password: 'password123', publicationId,
    });
    expect(taro.setStorageSync).toHaveBeenCalledWith('access_token', 'at_2');
    expect(taro.setStorageSync).toHaveBeenCalledWith('refresh_token', 'rt_2');
  });

  it('password login 401 does not refresh a stale previous session', async () => {
    const { taro, auth } = await loadFresh('wx_test_appid');
    taro.getStorageSync.mockImplementation((key: string) => (
      key === 'access_token' ? 'old-access' : key === 'refresh_token' ? 'old-refresh' : ''
    ));
    taro.request.mockResolvedValueOnce({
      statusCode: 401,
      data: { message: '账号或密码错误' },
    });

    await expect(auth.login('DEMO', 'bad', 'wrong', publicationId)).rejects.toThrow('账号或密码错误');

    expect(taro.request).toHaveBeenCalledTimes(1);
    const arg = taro.request.mock.calls[0][0];
    expect(arg.url).toMatch(/\/auth\/miniapp\/login$/);
    expect(arg.header.Authorization).toBeUndefined();
    expect(taro.setStorageSync).not.toHaveBeenCalled();
  });

  it('wechat register 401 does not refresh a stale previous session', async () => {
    const { taro, auth } = await loadFresh('wx_test_appid');
    taro.getStorageSync.mockImplementation((key: string) => (
      key === 'access_token' ? 'old-access' : key === 'refresh_token' ? 'old-refresh' : ''
    ));
    taro.login.mockResolvedValue({ code: 'jscode_register' });
    taro.request.mockResolvedValueOnce({
      statusCode: 401,
      data: { message: '微信注册失败' },
    });

    await expect(auth.registerWechat('新用户', publicationId, '13900001111'))
      .rejects.toThrow('微信注册失败');

    expect(taro.request).toHaveBeenCalledTimes(1);
    const arg = taro.request.mock.calls[0][0];
    expect(arg.url).toMatch(/\/auth\/miniapp\/wechat\/register$/);
    expect(arg.header.Authorization).toBeUndefined();
    expect(taro.setStorageSync).not.toHaveBeenCalled();
  });

  it('wechat register success clears any stale previous session', async () => {
    const { taro, auth } = await loadFresh('wx_test_appid');
    taro.getStorageSync.mockImplementation((key: string) => (
      key === 'access_token' ? 'old-access' : key === 'refresh_token' ? 'old-refresh' : ''
    ));
    taro.login.mockResolvedValue({ code: 'jscode_register' });
    taro.request.mockResolvedValueOnce(okResp({ applicationId: 'application-1', status: 'pending' }));

    const result = await auth.registerWechat('新用户', publicationId, '13900001111');

    expect(result).toEqual({ applicationId: 'application-1', status: 'pending' });
    const arg = taro.request.mock.calls[0][0];
    expect(arg.url).toMatch(/\/auth\/miniapp\/wechat\/register$/);
    expect(arg.data).toEqual({
      appId: 'wx_test_appid',
      code: 'jscode_register',
      displayName: '新用户',
      phone: '13900001111',
      publicationId,
    });
    expect(taro.removeStorageSync).toHaveBeenCalledWith('access_token');
    expect(taro.removeStorageSync).toHaveBeenCalledWith('refresh_token');
    expect(taro.setStorageSync).not.toHaveBeenCalled();
  });

  it('queries registration status with a fresh WeChat code and no bearer token', async () => {
    const { taro, auth } = await loadFresh('wx_test_appid');
    taro.getStorageSync.mockImplementation((key: string) => (
      key === 'access_token' ? 'old-access' : key === 'refresh_token' ? 'old-refresh' : ''
    ));
    taro.login.mockResolvedValue({ code: 'fresh-status-code' });
    taro.request.mockResolvedValueOnce(okResp({
      applicationId: 'application-1',
      displayName: '新用户',
      status: 'approved',
      updatedAt: null,
    }));

    await expect(auth.getWechatRegistrationStatus()).resolves.toMatchObject({
      applicationId: 'application-1',
      status: 'approved',
    });
    const arg = taro.request.mock.calls[0][0];
    expect(arg.url).toMatch(/\/auth\/wechat\/register\/status$/);
    expect(arg.header.Authorization).toBeUndefined();
  });

  it('throws when Taro.login returns no code', async () => {
    const { taro, auth } = await loadFresh('wx_test_appid');
    taro.login.mockResolvedValue({ code: '' });

    await expect(auth.loginWechat(publicationId)).rejects.toThrow('微信登录失败');
    expect(taro.request).not.toHaveBeenCalled();
  });
});
