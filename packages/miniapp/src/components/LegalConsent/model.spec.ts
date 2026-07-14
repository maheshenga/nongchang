import { describe, expect, it } from 'vitest';
import {
  buildLegalDocumentUrl,
  consentKey,
  shouldResetConsent,
} from './model';

const configuredLegal = {
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

describe('legal consent model', () => {
  it('builds a stable key from tenant and immutable publication', () => {
    expect(consentKey(configuredLegal)).toBe(
      `${configuredLegal.tenantId}:${configuredLegal.publicationId}`,
    );
    expect(consentKey(null)).toBeNull();
  });

  it('resets authorization whenever the institution or publication changes', () => {
    expect(shouldResetConsent(configuredLegal, configuredLegal)).toBe(false);
    expect(shouldResetConsent(configuredLegal, {
      ...configuredLegal,
      publicationId: '33333333-3333-4333-8333-333333333333',
    })).toBe(true);
    expect(shouldResetConsent(configuredLegal, null)).toBe(true);
  });

  it('encodes legal document routes and lookup values', () => {
    expect(buildLegalDocumentUrl('privacy', {
      tenantCode: 'DEMO 租户',
      appId: 'wx/app',
    })).toBe(
      '/pages/legal/index?type=privacy&tenantCode=DEMO%20%E7%A7%9F%E6%88%B7&appId=wx%2Fapp',
    );
  });
});
