import { describe, expect, it } from 'vitest';

describe('legal model', () => {
  it('maps a stored legal date to an ISO date-only string', async () => {
    const model = await import('./legal.model');

    expect(model.toDateOnly(new Date('2026-07-14T00:00:00.000Z'))).toBe('2026-07-14');
  });

  it('maps immutable publication metadata for the admin view', async () => {
    const model = await import('./legal.model');
    const row = {
      id: '22222222-2222-4222-8222-222222222222',
      tenantId: '11111111-1111-4111-8111-111111111111',
      operatorName: '示例农业科技有限公司',
      contactAddress: '杭州市示例路 1 号',
      privacyContact: '数据保护负责人',
      contactPhone: '0571-12345678',
      contactEmail: null,
      privacyVersion: 'privacy-v1',
      agreementVersion: 'agreement-v1',
      effectiveDate: new Date('2026-07-14T00:00:00.000Z'),
      privacyPolicyText: '隐私政策正文'.repeat(80),
      userAgreementText: '用户协议正文'.repeat(80),
      publishedAt: new Date('2026-07-14T10:00:00.000Z'),
    };

    expect(model.toPublicationSummary(row)).toEqual({
      id: row.id,
      privacyVersion: 'privacy-v1',
      agreementVersion: 'agreement-v1',
      effectiveDate: '2026-07-14',
      publishedAt: '2026-07-14T10:00:00.000Z',
    });
  });

  it('maps only immutable publication fields to the configured public view', async () => {
    const model = await import('./legal.model');
    const row = {
      id: '22222222-2222-4222-8222-222222222222',
      tenantId: '11111111-1111-4111-8111-111111111111',
      operatorName: '示例农业科技有限公司',
      contactAddress: '杭州市示例路 1 号',
      privacyContact: '数据保护负责人',
      contactPhone: null,
      contactEmail: 'privacy@example.com',
      privacyVersion: 'privacy-v1',
      agreementVersion: 'agreement-v1',
      effectiveDate: new Date('2026-07-14T00:00:00.000Z'),
      privacyPolicyText: '隐私政策正文'.repeat(80),
      userAgreementText: '用户协议正文'.repeat(80),
      publishedAt: new Date('2026-07-14T10:00:00.000Z'),
    };

    expect(model.toPublicLegal(row)).toEqual({
      configured: true,
      tenantId: row.tenantId,
      publicationId: row.id,
      operatorName: row.operatorName,
      contactAddress: row.contactAddress,
      privacyContact: row.privacyContact,
      contactPhone: null,
      contactEmail: 'privacy@example.com',
      privacyVersion: 'privacy-v1',
      agreementVersion: 'agreement-v1',
      effectiveDate: '2026-07-14',
      privacyPolicyText: row.privacyPolicyText,
      userAgreementText: row.userAgreementText,
      publishedAt: '2026-07-14T10:00:00.000Z',
    });
  });
});
