import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'DashboardDemo.tsx');

describe('DashboardDemo truthfulness boundary', () => {
  it('does not present simulated demo capabilities as real production features', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).not.toContain('Math.random');
    expect(source).not.toContain('智能种植顾问 (AI)');
    expect(source).not.toContain('年度溯源决策报告 (PDF)');
    expect(source).not.toContain('自动刷新: 开启');
    expect(source).not.toContain('自动刷新: 关闭');
    expect(source).not.toContain('Gemini AI 植保风险自动预警');
    expect(source).not.toContain('生成合并 PDF 中');

    expect(source).toContain('演示种植顾问');
    expect(source).toContain('演示经营简报');
    expect(source).toContain('演示刷新标记');
    expect(source).toContain('AI 示例');
    expect(source).toContain('PDF 示例');
  });

  it('loads html2canvas only when the demo Gantt export is requested', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).not.toMatch(/import\s+html2canvas\s+from\s+['"]html2canvas['"]/);
    expect(source).toContain("import('html2canvas')");
  });
});
