import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/components/DashboardDemo.tsx'), 'utf8');

describe('DashboardDemo module boundary', () => {
  it('keeps the demo coordinator below 400 lines', () => {
    expect(source.split(/\r?\n/).length).toBeLessThan(400);
  });

  it.each([
    './dashboard-demo/DemoKpiGrid',
    './dashboard-demo/DemoMapPanel',
    './dashboard-demo/DemoChartsPanel',
    './dashboard-demo/DemoOperationsPanel',
  ])('imports %s', (modulePath) => {
    expect(source).toContain(modulePath);
  });
});
