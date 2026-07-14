import { describe, expect, it } from 'vitest';
import {
  legalDocumentPayloadSchema,
  publicLegalQuerySchema,
  publicLegalResponseSchema,
} from './legal.dto';

const validLegalDraft = {
  operatorName: '示例农业科技有限公司',
  contactAddress: '浙江省杭州市示例路 1 号',
  privacyContact: '数据保护负责人',
  contactPhone: '0571-12345678',
  contactEmail: null,
  privacyVersion: 'privacy-2026-07',
  agreementVersion: 'agreement-2026-07',
  effectiveDate: '2026-07-14',
  privacyPolicyText: '隐私政策正文'.repeat(80),
  userAgreementText: '用户协议正文'.repeat(80),
};

describe('legal contracts', () => {
  it('accepts a complete plain-text legal draft', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'legalDocumentPayloadSchema') as
      | { parse(value: unknown): unknown }
      | undefined;

    expect(schema).toBeDefined();
    expect(schema?.parse(validLegalDraft)).toEqual(validLegalDraft);
  });

  it('requires a contact phone or email', () => {
    expect(() => legalDocumentPayloadSchema.parse({
      ...validLegalDraft,
      contactPhone: null,
      contactEmail: null,
    })).toThrow('联系电话和联系邮箱至少填写一项');
  });

  it('rejects an operator name shorter than two characters', () => {
    expect(() => legalDocumentPayloadSchema.parse({
      ...validLegalDraft,
      operatorName: '甲',
    })).toThrow();
  });

  it('rejects a contact address shorter than two characters', () => {
    expect(() => legalDocumentPayloadSchema.parse({
      ...validLegalDraft,
      contactAddress: '杭',
    })).toThrow();
  });

  it('rejects a privacy contact shorter than two characters', () => {
    expect(() => legalDocumentPayloadSchema.parse({
      ...validLegalDraft,
      privacyContact: '甲',
    })).toThrow();
  });

  it('rejects an empty privacy-policy version', () => {
    expect(() => legalDocumentPayloadSchema.parse({
      ...validLegalDraft,
      privacyVersion: '',
    })).toThrow();
  });

  it('rejects an empty user-agreement version', () => {
    expect(() => legalDocumentPayloadSchema.parse({
      ...validLegalDraft,
      agreementVersion: '',
    })).toThrow();
  });

  it('rejects a future effective date', () => {
    expect(() => legalDocumentPayloadSchema.parse({
      ...validLegalDraft,
      effectiveDate: '2999-01-01',
    })).toThrow('生效日期不能晚于今天');
  });

  it('requires an ISO date-only effective date', () => {
    expect(() => legalDocumentPayloadSchema.parse({
      ...validLegalDraft,
      effectiveDate: '2020/01/01',
    })).toThrow();
  });

  it('rejects a privacy policy shorter than 200 characters', () => {
    expect(() => legalDocumentPayloadSchema.parse({
      ...validLegalDraft,
      privacyPolicyText: '过短',
    })).toThrow();
  });

  it('rejects a user agreement shorter than 200 characters', () => {
    expect(() => legalDocumentPayloadSchema.parse({
      ...validLegalDraft,
      userAgreementText: '过短',
    })).toThrow();
  });

  it('rejects an invalid contact email', () => {
    expect(() => legalDocumentPayloadSchema.parse({
      ...validLegalDraft,
      contactPhone: null,
      contactEmail: 'not-an-email',
    })).toThrow();
  });

  it('rejects a contact phone shorter than five characters', () => {
    expect(() => legalDocumentPayloadSchema.parse({
      ...validLegalDraft,
      contactPhone: '1234',
    })).toThrow();
  });

  it('normalizes a tenant code for public legal lookup', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'publicLegalQuerySchema') as
      | { parse(value: unknown): unknown }
      | undefined;

    expect(schema).toBeDefined();
    expect(schema?.parse({ tenantCode: ' demo ' })).toEqual({ tenantCode: 'DEMO' });
  });

  it('requires a tenant code or AppID for public legal lookup', () => {
    expect(() => publicLegalQuerySchema.parse({})).toThrow(
      'tenantCode 或 appId 至少提供一项',
    );
  });

  it('keeps an unconfigured public response free of draft fields', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'publicLegalResponseSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;

    expect(schema).toBeDefined();
    const parsed = schema?.parse({
      configured: false,
      tenantId: '11111111-1111-4111-8111-111111111111',
    });
    expect(parsed).toEqual({
      configured: false,
      tenantId: '11111111-1111-4111-8111-111111111111',
    });
    expect(parsed).not.toHaveProperty('privacyPolicyText');
  });

  it('accepts an immutable configured public publication', () => {
    const parsed = publicLegalResponseSchema.parse({
      ...validLegalDraft,
      configured: true,
      tenantId: '11111111-1111-4111-8111-111111111111',
      publicationId: '22222222-2222-4222-8222-222222222222',
      publishedAt: '2026-07-14T10:00:00.000Z',
    });

    expect(parsed.configured).toBe(true);
  });

  it('accepts current-publication metadata for the admin view', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'legalPublicationSummarySchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;

    expect(schema).toBeDefined();
    expect(schema?.parse({
      id: '22222222-2222-4222-8222-222222222222',
      privacyVersion: 'privacy-2026-07',
      agreementVersion: 'agreement-2026-07',
      effectiveDate: '2026-07-14',
      publishedAt: '2026-07-14T10:00:00.000Z',
    })).toMatchObject({ privacyVersion: 'privacy-2026-07' });
  });

  it('keeps the editable draft and current publication separate', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'legalSettingsViewSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;

    expect(schema).toBeDefined();
    expect(schema?.parse({
      draft: validLegalDraft,
      currentPublication: {
        id: '22222222-2222-4222-8222-222222222222',
        privacyVersion: 'privacy-2026-06',
        agreementVersion: 'agreement-2026-06',
        effectiveDate: '2026-06-01',
        publishedAt: '2026-06-01T00:00:00.000Z',
      },
    })).toMatchObject({
      draft: { privacyVersion: 'privacy-2026-07' },
      currentPublication: { privacyVersion: 'privacy-2026-06' },
    });
  });
});
