import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(join(process.cwd(), 'src/app.config.ts'), 'utf8');

describe('miniapp app.config branding boundary', () => {
  it('keeps the production shell on generic defaults', () => {
    const text = source();

    expect(text).toContain('navigationBarTitleText: DEFAULT_TENANT_SETTINGS.workbenchTitle');
    expect(text).toContain("text: '工作台'");
    expect(text).toContain("text: '溯源'");
    expect(text).toContain("text: '我的'");
    expect(text).not.toContain('芍药');
    expect(text).not.toContain('白芍');
  });
});
