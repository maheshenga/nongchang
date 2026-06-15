import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toCSV, downloadCSV } from './csv';

describe('toCSV', () => {
  it('普通行直接逗号拼接', () => {
    expect(toCSV([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2');
  });
  it('含逗号/引号/换行的单元格用双引号包裹并翻倍内部引号', () => {
    expect(toCSV([['x,y', 'a"b', 'c\nd']])).toBe('"x,y","a""b","c\nd"');
  });
  it('null/undefined 转空串', () => {
    expect(toCSV([[null, undefined, 0]])).toBe(',,0');
  });
});

describe('downloadCSV', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('创建带 download 属性的链接并点击', () => {
    const click = vi.fn();
    const orig = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = orig(tag) as HTMLAnchorElement;
      if (tag === 'a') el.click = click;
      return el;
    });
    downloadCSV('报表.csv', [['批次号', '品种'], ['B1', '芍药']]);
    expect(click).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });
});
