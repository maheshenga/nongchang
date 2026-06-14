import { describe, it, expect, beforeEach } from 'vitest';
import taro from '@tarojs/taro';
import { listQuickTemplates } from './quickTemplate';

describe('api/quickTemplate', () => {
  beforeEach(() => (taro as any).__reset());

  it('listQuickTemplates GET /quick-templates 返回列表', async () => {
    const rows = [{ id: 't1', name: '浇水', action: '浇水', note: null, cost: null, labor: null, sort: 0, createdAt: '2026-01-01' }];
    (taro.request as any).mockResolvedValue({ statusCode: 200, data: rows });
    const out = await listQuickTemplates();
    expect(out).toEqual(rows);
    const arg = (taro.request as any).mock.calls[0][0];
    expect(arg.url).toMatch(/\/quick-templates$/);
  });
});
