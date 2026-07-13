import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.tsx'), 'utf8');

describe('registration status workflow boundary', () => {
  it('keeps the successful application visible instead of timing out back', () => {
    expect(source).toContain('buildRegistrationStatus');
    expect(source).toContain('statusLabel');
    expect(source).toContain('trackingMessage');
    expect(source).toContain('返回登录');
    expect(source).not.toContain('setTimeout');
  });
});
