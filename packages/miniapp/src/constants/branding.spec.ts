import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME } from './branding';

describe('miniapp branding', () => {
  it('uses the generic production product name in app configuration and theme copy', () => {
    expect(PRODUCT_NAME).toBe('农场溯源管理');
    const appConfig = readFileSync(join(process.cwd(), 'src/app.config.ts'), 'utf8');
    const theme = readFileSync(join(process.cwd(), 'src/styles/theme.scss'), 'utf8');
    expect(appConfig).toContain('PRODUCT_NAME');
    expect(`${appConfig}\n${theme}`).not.toContain('芍药工作台');
  });
});
