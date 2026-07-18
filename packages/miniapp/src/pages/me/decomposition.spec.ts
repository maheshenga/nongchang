import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Me page component boundaries', () => {
  it('extracts field presentation from account orchestration', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/me/index.tsx'), 'utf8');
    expect(page).toContain("from './MeFieldSection'");
    expect(page.split(/\r?\n/).length).toBeLessThan(250);
  });
});
