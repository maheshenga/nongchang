import Taro from '@tarojs/taro';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublicLegal } from './legal';

const configured = {
  configured: true as const,
  tenantId: '11111111-1111-4111-8111-111111111111',
  publicationId: '22222222-2222-4222-8222-222222222222',
  operatorName: '示例农业科技有限公司',
  contactAddress: '杭州市示例路 1 号',
  privacyContact: '数据保护负责人',
  contactPhone: '0571-12345678',
  contactEmail: null,
  privacyVersion: 'privacy-v1',
  agreementVersion: 'agreement-v1',
  effectiveDate: '2026-07-14',
  privacyPolicyText: '隐私政策正文'.repeat(80),
  userAgreementText: '用户协议正文'.repeat(80),
  publishedAt: '2026-07-14T09:00:00.000Z',
};

beforeEach(() => vi.mocked(Taro.request).mockReset());

describe('miniapp public legal api', () => {
  it('encodes the tenant and AppID lookup without authentication', async () => {
    vi.mocked(Taro.request).mockResolvedValue({ statusCode: 200, data: configured } as never);

    await expect(getPublicLegal({ tenantCode: 'DEMO 租户', appId: 'wx/app' }))
      .resolves.toEqual(configured);

    const request = vi.mocked(Taro.request).mock.calls[0][0];
    expect(request.url).toMatch(/\/public\/legal\?tenantCode=DEMO%20%E7%A7%9F%E6%88%B7&appId=wx%2Fapp$/);
    expect(request.header?.Authorization).toBeUndefined();
  });

  it('parses the explicit unconfigured response', async () => {
    const response = {
      configured: false as const,
      tenantId: '11111111-1111-4111-8111-111111111111',
    };
    vi.mocked(Taro.request).mockResolvedValue({ statusCode: 200, data: response } as never);

    await expect(getPublicLegal({ appId: 'wx-example' })).resolves.toEqual(response);
  });

  it('rejects malformed public payloads', async () => {
    vi.mocked(Taro.request).mockResolvedValue({ statusCode: 200, data: { configured: true } } as never);

    await expect(getPublicLegal({ appId: 'wx-example' }))
      .rejects.toThrow('Invalid legal.public response');
  });
});
