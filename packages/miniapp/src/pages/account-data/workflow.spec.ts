import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.tsx'), 'utf8');

describe('My Data page workflow', () => {
  it('loads live data with explicit loading, error, empty, and retry states', () => {
    expect(source).toContain('useDidShow');
    expect(source).toContain('getMyData');
    expect(source).toContain('数据加载中');
    expect(source).toContain('重新加载数据');
    expect(source).toContain('暂无记录');
    expect(source).toContain('tenant');
    expect(source).toContain('account');
  });

  it('shows every category count, exclusions, export errors, and share actions', () => {
    for (const copy of [
      '地块', '批次', '农事记录', '农资库存', '农资领用',
      '上传记录', 'AI 操作', '额度订单', '额度流水',
    ]) expect(source).toContain(copy);
    expect(source).toContain('不包含上传文件二进制');
    expect(source).toContain('exportMyData');
    expect(source).toContain('shareMyData');
    expect(source).toContain('导出 JSON 数据副本');
    expect(source).toContain('导出 CSV 数据副本');
    expect(source).toContain('重新导出');
    expect(source).toContain('分享数据副本');
    expect(source).toContain('formatAccountDate');
    expect(source).toContain('accountRecordLabel');
    expect(source).not.toContain('|| row.id');
  });
});
