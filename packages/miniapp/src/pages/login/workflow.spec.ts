import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.tsx'), 'utf8');

describe('miniapp login recovery workflow', () => {
  it('shares one busy gate, preserves errors, and requires authorization', () => {
    expect(source).toContain('const busy = loading || wxLoading');
    expect(source).toContain('normalizePasswordLogin');
    expect(source).toContain('canStartLogin');
    expect(source).toContain('role="alert"');
    expect(source).toContain('authorized');
    expect(source).toContain('我已阅读并同意');
    expect(source).toContain('忘记密码');
    expect(source).toContain('buildSupportMessage(SUPPORT_CONTACT)');
    expect(source).not.toContain('onClick={wxLoading ? undefined : onWechatLogin}');
  });
});
