import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.tsx'), 'utf8');
const consentSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'components', 'LegalConsent', 'index.tsx'),
  'utf8',
);

describe('registration status workflow boundary', () => {
  it('keeps the successful application visible instead of timing out back', () => {
    expect(source).toContain('buildRegistrationStatus');
    expect(source).toContain('buildRegistrationStatusFromLookup');
    expect(source).toContain('getWechatRegistrationStatus');
    expect(source).toContain('statusLabel');
    expect(source).toContain('申请编号：{status.applicationId}');
    expect(source).toContain('刷新申请状态');
    expect(source).toContain('查询已有申请');
    expect(source).toContain('返回登录');
    expect(source).not.toContain('setTimeout');
  });

  it('owns an independent fail-closed legal consent state', () => {
    expect(source).toContain('getPublicLegal');
    expect(source).toContain('LegalConsent');
    expect(source).toContain('const [authorized, setAuthorized] = useState(false)');
    expect(source).toContain('publicationId');
    expect(source).toContain('registerWechat(name, legal.publicationId');
    expect(source).toContain('disabled={!canSubmit}');
    expect(consentSource).toContain('《用户协议》');
    expect(consentSource).toContain('《隐私政策》');
    expect(consentSource).toContain('重新加载协议');
    expect(consentSource).toContain('effectiveDate');
    expect(source).not.toContain('隐私与授权说明');
  });
});
