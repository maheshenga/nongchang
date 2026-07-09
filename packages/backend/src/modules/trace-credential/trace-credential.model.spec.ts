import { describe, expect, it } from 'vitest';
import {
  TRACE_CREDENTIAL_INVALID_URL_MESSAGE,
  TRACE_CREDENTIAL_NO_TRUSTED_ORIGIN_MESSAGE,
  TRACE_CREDENTIAL_UNTRUSTED_ORIGIN_MESSAGE,
  addTrustedOrigin,
  buildTraceCredentialCreateData,
  buildTrustedFileOrigins,
  toTraceCredentialView,
  validateTrustedFileUrl,
} from './trace-credential.model';

describe('trace credential model helpers', () => {
  it('projects credential rows with nullable issuedAt and ISO createdAt', () => {
    expect(toTraceCredentialView({
      id: 'cr1',
      batchId: 'b1',
      type: 'certificate',
      title: 'Organic certificate',
      issuer: 'Certification Center',
      serialNo: 'OC-2026-001',
      issuedAt: new Date('2026-06-01T00:00:00.000Z'),
      fileUrl: 'https://oss.example.com/cert.pdf',
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
    })).toEqual({
      id: 'cr1',
      batchId: 'b1',
      type: 'certificate',
      title: 'Organic certificate',
      issuer: 'Certification Center',
      serialNo: 'OC-2026-001',
      issuedAt: '2026-06-01T00:00:00.000Z',
      fileUrl: 'https://oss.example.com/cert.pdf',
      createdAt: '2026-06-15T00:00:00.000Z',
    });

    expect(toTraceCredentialView({
      id: 'cr2',
      batchId: 'b1',
      type: 'report',
      title: 'Residue report',
      issuer: 'SGS',
      serialNo: null,
      issuedAt: null,
      fileUrl: 'https://oss.example.com/report.pdf',
      createdAt: new Date('2026-06-16T00:00:00.000Z'),
    }).issuedAt).toBeNull();
  });

  it('builds create data with tenant id and nullable optional fields', () => {
    expect(buildTraceCredentialCreateData({
      tenantId: 't1',
      dto: {
        batchId: 'b1',
        type: 'certificate',
        title: 'Organic certificate',
        issuer: 'Certification Center',
        serialNo: 'OC-2026-001',
        issuedAt: '2026-06-01T00:00:00.000Z',
        fileUrl: 'https://oss.example.com/cert.pdf',
      },
    })).toEqual({
      tenantId: 't1',
      batchId: 'b1',
      type: 'certificate',
      title: 'Organic certificate',
      issuer: 'Certification Center',
      serialNo: 'OC-2026-001',
      issuedAt: new Date('2026-06-01T00:00:00.000Z'),
      fileUrl: 'https://oss.example.com/cert.pdf',
    });

    expect(buildTraceCredentialCreateData({
      tenantId: 't1',
      dto: {
        batchId: 'b1',
        type: 'report',
        title: 'Residue report',
        issuer: 'SGS',
        fileUrl: 'https://oss.example.com/report.pdf',
      },
    })).toMatchObject({
      serialNo: null,
      issuedAt: null,
    });
  });

  it('adds trusted origins from valid urls and ignores blank or invalid urls', () => {
    const origins = new Set<string>();

    addTrustedOrigin(origins, 'https://oss.example.com/uploads/path');
    addTrustedOrigin(origins, 'not-a-url');
    addTrustedOrigin(origins, null);
    addTrustedOrigin(origins, undefined);

    expect([...origins]).toEqual(['https://oss.example.com']);
  });

  it('builds trusted file origins from enabled tenant config and env base url', () => {
    const origins = buildTrustedFileOrigins({
      ossConfig: { enabled: true, baseUrl: 'https://tenant.example.com/uploads' },
      envBaseUrl: 'https://env.example.com/public',
    });

    expect(origins.has('https://tenant.example.com')).toBe(true);
    expect(origins.has('https://env.example.com')).toBe(true);
  });

  it('does not trust disabled tenant config base url', () => {
    const origins = buildTrustedFileOrigins({
      ossConfig: { enabled: false, baseUrl: 'https://tenant.example.com/uploads' },
      envBaseUrl: null,
    });

    expect(origins.size).toBe(0);
  });

  it('validates trusted file urls by origin only', () => {
    expect(validateTrustedFileUrl(
      'https://oss.example.com/other-folder/cert.pdf',
      new Set(['https://oss.example.com']),
    )).toEqual({ ok: true });
  });

  it('returns stable validation reasons and messages for unsafe urls', () => {
    expect(validateTrustedFileUrl('not-a-url', new Set(['https://oss.example.com']))).toEqual({
      ok: false,
      reason: 'invalid-url',
    });
    expect(validateTrustedFileUrl('https://oss.example.com/cert.pdf', new Set())).toEqual({
      ok: false,
      reason: 'missing-trusted-origin',
    });
    expect(validateTrustedFileUrl('https://evil.example/cert.pdf', new Set(['https://oss.example.com']))).toEqual({
      ok: false,
      reason: 'untrusted-origin',
    });
    expect(TRACE_CREDENTIAL_INVALID_URL_MESSAGE).toBe('资质文件 URL 无效');
    expect(TRACE_CREDENTIAL_NO_TRUSTED_ORIGIN_MESSAGE).toBe('No trusted storage origin is configured for credential files');
    expect(TRACE_CREDENTIAL_UNTRUSTED_ORIGIN_MESSAGE).toBe('资质文件 URL 不在可信存储域名内');
  });
});
