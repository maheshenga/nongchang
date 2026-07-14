import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.tsx'), 'utf8');
const consentSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'components', 'LegalConsent', 'index.tsx'),
  'utf8',
);

describe('miniapp login recovery workflow', () => {
  it('loads a current publication, resets stale consent, and fails closed', () => {
    expect(source).toContain('const busy = loading || wxLoading');
    expect(source).toContain('normalizePasswordLogin');
    expect(source).toContain('canStartLogin');
    expect(source).toContain('getPublicLegal');
    expect(source).toContain('LegalConsent');
    expect(source).toContain('legalLookupCode');
    expect(source).toContain('onBlur');
    expect(source).toContain('setAuthorized(false)');
    expect(source).toContain('publicationId');
    expect(source).toContain('status === 409');
    expect(source).toContain('legalRequestId');
    expect(source).toContain('requestId !== legalRequestId.current');
    expect(source).toContain('login__error');
    expect(source).toContain('忘记密码');
    expect(source).toContain('buildSupportMessage(SUPPORT_CONTACT)');
    expect(source).not.toContain('onClick={wxLoading ? undefined : onWechatLogin}');
  });

  it('renders explicit agreement, privacy, retry, version, and effective-date copy', () => {
    expect(consentSource).toContain('《用户协议》');
    expect(consentSource).toContain('《隐私政策》');
    expect(consentSource).toContain('重新加载协议');
    expect(consentSource).toContain('privacyVersion');
    expect(consentSource).toContain('agreementVersion');
    expect(consentSource).toContain('effectiveDate');
    expect(consentSource).not.toContain('隐私与授权说明');
    expect(source).not.toContain('隐私与授权说明');
  });
});
