import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('workspace lazy boundaries', () => {
  it('keeps heavy workspace pages behind lazy imports', () => {
    const source = readFileSync(resolve(__dirname, 'AppWorkspaceViews.tsx'), 'utf8');

    for (const component of ['FarmFields', 'AiAssistant', 'BatchAdmin', 'BillingAdmin']) {
      expect(source).toContain(`lazy(() => import('./${component}'))`);
    }
  });

  it('loads html2canvas only from the dashboard export action', () => {
    const source = readFileSync(resolve(__dirname, 'dashboard-demo/DemoChartsPanel.tsx'), 'utf8');

    expect(source).not.toMatch(/import\s+html2canvas\s+from\s+['"]html2canvas['"]/);
    expect(source).toContain("import('html2canvas')");
  });
});
