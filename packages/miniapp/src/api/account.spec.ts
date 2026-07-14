import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const preview = {
  generatedAt: '2026-07-14T09:00:00.000Z',
  tenant: { id: 't1', code: 'DEMO', name: '示例租户' },
  account: {
    id: 'u1', tenantId: 't1', username: 'merchantA', role: 'merchant', agentId: null,
    displayName: '示例基地', phone: null, status: 'active', deletionVerification: 'password',
  },
  counts: {
    fields: 0, batches: 0, farmRecords: 0, supplies: 0, supplyIssues: 0,
    uploads: 0, aiOperations: 0, creditOrders: 0, creditLedgers: 0,
  },
  recent: {
    fields: [], batches: [], farmRecords: [], supplies: [], supplyIssues: [],
    uploads: [], aiOperations: [], creditOrders: [], creditAccount: null,
  },
  recentLimit: 20,
};

function makeJwt(): string {
  const encoded = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))
    .toString('base64url');
  return `header.${encoded}.signature`;
}

async function loadFresh(appId = 'wx0000000000000000') {
  vi.resetModules();
  vi.stubEnv('TARO_APP_WX_APPID', appId);
  const taro = (await import('@tarojs/taro')).default as any;
  taro.__reset();
  const store = await import('../store/auth');
  const account = await import('./account');
  return { taro, store, account };
}

describe('api/account', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('parses the authenticated personal-data preview', async () => {
    const { taro, store, account } = await loadFresh();
    store.setTokens({ accessToken: makeJwt(), refreshToken: 'refresh-1' });
    taro.request.mockResolvedValueOnce({ statusCode: 200, data: preview });

    await expect(account.getMyData()).resolves.toEqual(preview);
    expect(taro.request.mock.calls[0][0].url).toMatch(/\/auth\/me\/data$/);
  });

  it('downloads and saves a JSON copy in the user data directory', async () => {
    const { taro, store, account } = await loadFresh();
    store.setTokens({ accessToken: makeJwt(), refreshToken: 'refresh-1' });
    taro.downloadFile.mockResolvedValueOnce({ statusCode: 200, tempFilePath: '/tmp/export.json' });
    taro.saveFile.mockResolvedValueOnce({ savedFilePath: '/user-data/saved.json' });

    await expect(account.exportMyData('json')).resolves.toBe('/user-data/saved.json');
    expect(taro.downloadFile.mock.calls[0][0].url).toMatch(/\/auth\/me\/data\/export$/);
    expect(taro.saveFile).toHaveBeenCalledWith({
      tempFilePath: '/tmp/export.json',
      filePath: expect.stringMatching(/^\/user-data\/nongchang-account-data-\d+\.json$/),
    });
  });

  it('requests and saves a CSV copy with a format-specific extension', async () => {
    const { taro, store, account } = await loadFresh();
    store.setTokens({ accessToken: makeJwt(), refreshToken: 'refresh-1' });
    taro.downloadFile.mockResolvedValueOnce({ statusCode: 200, tempFilePath: '/tmp/export.csv' });
    taro.saveFile.mockResolvedValueOnce({ savedFilePath: '/user-data/saved.csv' });

    await expect(account.exportMyData('csv')).resolves.toBe('/user-data/saved.csv');
    expect(taro.downloadFile.mock.calls[0][0].url).toMatch(/\/auth\/me\/data\/export\?format=csv$/);
    expect(taro.saveFile).toHaveBeenCalledWith({
      tempFilePath: '/tmp/export.csv',
      filePath: expect.stringMatching(/^\/user-data\/nongchang-account-data-\d+\.csv$/),
    });
  });

  it('shares the saved file with a truthful name', async () => {
    const { taro, account } = await loadFresh();
    taro.shareFileMessage.mockResolvedValueOnce(undefined);

    await account.shareMyData('/user-data/saved.json', 'json');

    expect(taro.shareFileMessage).toHaveBeenCalledWith({
      filePath: '/user-data/saved.json',
      fileName: '农场账户数据副本.json',
    });
  });

  it('shares CSV with a format-specific human filename', async () => {
    const { taro, account } = await loadFresh();
    taro.shareFileMessage.mockResolvedValueOnce(undefined);

    await account.shareMyData('/user-data/saved.csv', 'csv');

    expect(taro.shareFileMessage).toHaveBeenCalledWith({
      filePath: '/user-data/saved.csv',
      fileName: '农场账户数据副本.csv',
    });
  });

  it('rejects a save result without a persisted file path', async () => {
    const { taro, store, account } = await loadFresh();
    store.setTokens({ accessToken: makeJwt(), refreshToken: 'refresh-1' });
    taro.downloadFile.mockResolvedValueOnce({ statusCode: 200, tempFilePath: '/tmp/export.json' });
    taro.saveFile.mockResolvedValueOnce({ errMsg: 'saveFile:fail' });

    await expect(account.exportMyData('json')).rejects.toThrow('数据副本保存失败');
  });

  it('clears local tokens only after password closure succeeds', async () => {
    const { taro, store, account } = await loadFresh();
    store.setTokens({ accessToken: makeJwt(), refreshToken: 'refresh-1' });
    taro.request.mockResolvedValueOnce({ statusCode: 500, data: { message: '注销失败' } });
    const input = {
      method: 'password' as const,
      currentPassword: 'password123',
      confirmation: '注销账号' as const,
    };

    await expect(account.closeMyAccount(input)).rejects.toThrow('注销失败');
    expect(store.getToken()).not.toBe('');
    expect(store.getRefreshToken()).toBe('refresh-1');

    taro.request.mockResolvedValueOnce({ statusCode: 204, data: undefined });
    await account.closeMyAccount(input);
    expect(store.getToken()).toBe('');
    expect(store.getRefreshToken()).toBe('');
  });

  it('uses a fresh WeChat code and exact destructive confirmation', async () => {
    const { taro, store, account } = await loadFresh('wx0000000000000000');
    store.setTokens({ accessToken: makeJwt(), refreshToken: 'refresh-1' });
    taro.login.mockResolvedValueOnce({ code: 'fresh-close-code' });
    taro.request.mockResolvedValueOnce({ statusCode: 204, data: undefined });

    await account.closeMyWechatAccount();

    expect(taro.request.mock.calls[0][0].data).toEqual({
      method: 'wechat',
      appId: 'wx0000000000000000',
      code: 'fresh-close-code',
      confirmation: '注销账号',
    });
    expect(store.getToken()).toBe('');
  });
});
