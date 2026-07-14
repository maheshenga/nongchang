import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME } from './branding';

describe('Web branding', () => {
  it('uses one production product name across public and authenticated shells', () => {
    expect(PRODUCT_NAME).toBe('农场溯源管理');
    for (const file of [
      join(process.cwd(), 'src/App.tsx'),
      join(process.cwd(), 'src/components/AppLogin.tsx'),
      join(process.cwd(), 'src/components/PublicLanding.tsx'),
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('PRODUCT_NAME');
      expect(source).not.toContain('芍药工作台');
    }
  });
});
