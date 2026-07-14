import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { getTenantReadiness } from './readiness';

const response = {
  ready: false,
  checks: [
    { code: 'legal', label: '法律协议已发布', ready: false, target: 'legalSettings' },
    { code: 'wechat', label: '微信小程序已启用', ready: true, target: 'integrations' },
    { code: 'oss', label: '对象存储已启用', ready: true, target: 'aiOssSettings' },
    { code: 'map', label: '地图服务已启用', ready: true, target: 'integrations' },
    { code: 'ai', label: 'AI 服务商已启用', ready: true, target: 'aiProviders' },
    { code: 'payment', label: '支付宝支付已启用', ready: true, target: 'billing' },
    { code: 'quota', label: '初始业务额度已配置', ready: true, target: 'billing' },
    { code: 'apiDomain', label: '公网 API 域名已配置', ready: true },
    { code: 'supportContact', label: '小程序客服联系方式已配置', ready: true },
    { code: 'salesContact', label: '销售开通联系方式已配置', ready: true },
  ],
};

describe('tenant readiness api', () => {
  beforeEach(() => requestMock.mockReset());

  it('loads and validates the tenant readiness view', async () => {
    requestMock.mockResolvedValue(response);

    await expect(getTenantReadiness()).resolves.toEqual(response);
    expect(requestMock).toHaveBeenCalledWith('/readiness/tenant');
  });

  it('rejects malformed or value-bearing readiness responses', async () => {
    requestMock.mockResolvedValue({
      ready: true,
      checks: [{ code: 'wechat', label: '微信', ready: true, appId: 'secret' }],
    });

    await expect(getTenantReadiness()).rejects.toThrow('Invalid readiness.tenant response');
  });
});
