import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(join(process.cwd(), 'src/components/BatchAdmin.tsx'), 'utf8');
const globalStyles = () => readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

describe('BatchAdmin Fluent deep surfaces', () => {
  it('keeps production-visible deep workflows out of the legacy emerald card style', () => {
    const text = source();

    const forbiddenTokens = [
      'rounded-2xl',
      'rounded-xl',
      'rounded-3xl',
      'bg-emerald',
      'hover:bg-emerald',
      'text-emerald',
      'border-emerald',
      'shadow-emerald',
      'bg-gradient-to-r',
      'bg-gradient-to-br',
      'shadow-2xl',
    ];

    for (const token of forbiddenTokens) {
      expect(text).not.toContain(token);
    }
  });

  it('does not imply unsupported certification or cryptographic guarantees in batch labels and reports', () => {
    const text = source();

    const unsupportedClaims = [
      '官方政府防伪',
      '政府防伪',
      '高级矢量排版控制器',
      '防撕 Logo',
      '一键生成溯源报告 ->',
    ];

    for (const claim of unsupportedClaims) {
      expect(text).not.toContain(claim);
    }
  });

  it('uses real API language for trace-code generation and export actions', () => {
    const text = source();

    expect(text).toContain('生成真实溯源码');
    expect(text).toContain('导出溯源报告');
    expect(text).toContain('数据来源于批次、农事记录、溯源事件与扫码统计接口');
    expect(text).toContain('CSV（Excel 可打开）');
  });

  it('contains no DOM PDF, whole-page print, or fake Excel export implementation', () => {
    const text = source();
    const css = globalStyles();
    const wholePagePrint = ['window', 'print()'].join('.');
    const printSheet = ['print', 'sheet'].join('-');

    for (const forbidden of [
      "from 'qrcode.react'",
      'QRCodeSVG',
      wholePagePrint,
      printSheet,
      '标准 PDF 溯源版',
      '原始 Excel 数据表',
      '后续生成',
    ]) {
      expect(text).not.toContain(forbidden);
    }
    expect(css).not.toContain(printSheet);
  });
});
