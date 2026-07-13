import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'WorkQuickActions.tsx');
const source = readFileSync(sourcePath, 'utf8');
const workSource = readFileSync(join(dirname(sourcePath), '..', 'index.tsx'), 'utf8');

describe('WorkQuickActions truthful copy', () => {
  it('uses real manual and location callbacks without blockchain capability claims', () => {
    expect(source).not.toMatch(/区块链|上链|哈希|存证/);
    expect(source).toContain('地块定位');
    expect(source).toContain("run('manual')");
    expect(source).toContain("run('location')");
    expect(source).not.toContain('位置记录请在农事表单中保存');
  });

  it('uses generic field-work copy and visible offline recovery guidance', () => {
    expect(workSource).toContain('田间工作台');
    expect(workSource).toContain('基地生产组');
    expect(workSource).toContain('草稿会保存在本机');
    expect(workSource).not.toContain('芍药工作台');
    expect(workSource).not.toContain('白芍种植组');
  });

  it('loads work resources independently with visible retry paths', () => {
    expect(workSource).toContain('loadBatches');
    expect(workSource).toContain('loadRecords');
    expect(workSource).toContain('loadTemplates');
    expect(workSource).toContain('loadBilling');
    expect(workSource).toContain('Promise.allSettled');
    expect(workSource).toContain('DataState');
    expect(workSource).not.toContain('.catch(() => setTemplates([]))');
    expect(workSource).not.toContain('.catch(() => {})');
  });
});
