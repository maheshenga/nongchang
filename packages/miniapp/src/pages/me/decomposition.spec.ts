import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Me page component boundaries', () => {
  it('extracts field presentation from account orchestration', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/me/index.tsx'), 'utf8');
    expect(page).toContain("from './MeFieldSection'");
    expect(page.split(/\r?\n/).length).toBeLessThan(270);
  });

  it('loads tenant support settings and never shows a hardcoded contact', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/me/index.tsx'), 'utf8');
    expect(page).toContain('getTenantBranding');
    expect(page).toContain('setSupportContact(null)');
    expect(page).toContain('createLatestRequestGate');
    expect(page).toContain('const supportRequestGateRef = useRef(createLatestRequestGate())');
    expect(page).toContain('const supportRequestId = supportRequestGateRef.current.begin()');
    expect(page).toContain('if (supportRequestGateRef.current.isLatest(supportRequestId)) setSupportContact');
    expect(page).toContain('loadTenantBranding({ forceRefresh: true })');
    expect(page).toContain('supportContact');
    expect(page).not.toContain('400-000-0000');
  });
});
