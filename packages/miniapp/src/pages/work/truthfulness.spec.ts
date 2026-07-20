import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(join(process.cwd(), 'src/pages/work/index.tsx'), 'utf8');

describe('miniapp work branding boundary', () => {
  it('uses tenant branding for the workbench title and fallback subtitle', () => {
    const text = source();

    expect(text).toContain('loadTenantBranding');
    expect(text).toContain('setNavigationBarTitle');
    expect(text).toContain('defaultBaseLabel');
    expect(text).toContain('defaultCropName');
    expect(text).toContain('workbenchTitle');
  });
});
