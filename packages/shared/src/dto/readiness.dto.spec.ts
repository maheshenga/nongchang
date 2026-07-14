import { describe, expect, it } from 'vitest';
import { tenantReadinessViewSchema } from './readiness.dto';

describe('tenantReadinessViewSchema', () => {
  it('accepts a secret-safe readiness view with stable navigation targets', () => {
    const view = {
      ready: false,
      checks: [
        { code: 'legal', label: '法律协议', ready: false, target: 'legalSettings' },
        { code: 'wechat', label: '微信小程序', ready: true, target: 'integrations' },
        { code: 'oss', label: '对象存储', ready: true, target: 'aiOssSettings' },
        { code: 'map', label: '地图服务', ready: true, target: 'integrations' },
        { code: 'ai', label: 'AI 服务', ready: true, target: 'aiProviders' },
        { code: 'payment', label: '支付服务', ready: true, target: 'billing' },
        { code: 'quota', label: '初始额度', ready: true, target: 'billing' },
        { code: 'apiDomain', label: '公网 API 域名', ready: true },
        { code: 'supportContact', label: '客服联系方式', ready: true },
        { code: 'salesContact', label: '销售联系方式', ready: true },
      ],
    } as const;

    expect(tenantReadinessViewSchema.parse(view)).toEqual(view);
  });

  it('rejects unknown checks and value-bearing configuration fields', () => {
    expect(() => tenantReadinessViewSchema.parse({
      ready: false,
      checks: [{ code: 'secretKey', label: '密钥', ready: false }],
    })).toThrow();
    expect(() => tenantReadinessViewSchema.parse({
      ready: true,
      checks: [{
        code: 'wechat', label: '微信小程序', ready: true, value: 'wx-secret-app-id',
      }],
    })).toThrow();
  });
});
