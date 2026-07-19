import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceFiles = [
  'DashboardDemo.tsx',
  'dashboard-demo/DemoKpiGrid.tsx',
  'dashboard-demo/DemoMapPanel.tsx',
  'dashboard-demo/DemoChartsPanel.tsx',
  'dashboard-demo/DemoOperationsPanel.tsx',
];
const source = () => sourceFiles
  .map(file => readFileSync(join(process.cwd(), 'src/components', file), 'utf8'))
  .join('\n');

describe('DashboardDemo truthfulness boundary', () => {
  it('does not present simulated demo capabilities as real production features', () => {
    const text = source();

    expect(text).not.toContain('Math.random');
    expect(text).not.toContain('智能种植顾问 (AI)');
    expect(text).not.toContain('年度溯源决策报告 (PDF)');
    expect(text).not.toContain('自动刷新: 开启');
    expect(text).not.toContain('自动刷新: 关闭');
    expect(text).not.toContain('Gemini AI 植保风险自动预警');
    expect(text).not.toContain('生成合并 PDF 中');

    expect(text).toContain('演示种植顾问');
    expect(text).toContain('演示经营简报');
    expect(text).toContain('演示刷新标记');
    expect(text).toContain('AI 示例');
    expect(text).toContain('PDF 示例');
  });

  it('loads html2canvas only when the demo Gantt export is requested', () => {
    const text = source();

    expect(text).not.toMatch(/import\s+html2canvas\s+from\s+['"]html2canvas['"]/);
    expect(text).toContain("import('html2canvas')");
  });
});
