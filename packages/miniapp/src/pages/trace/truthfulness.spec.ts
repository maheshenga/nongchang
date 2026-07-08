import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(join(process.cwd(), 'src/pages/trace/index.tsx'), 'utf8');

describe('miniapp trace truthfulness boundary', () => {
  it('does not expose unimplemented blockchain or certificate claims', () => {
    const text = source();

    expect(text).not.toContain('区块链');
    expect(text).not.toContain('上链');
    expect(text).not.toContain('哈希');
    expect(text).not.toContain('存证');
    expect(text).not.toContain('待接入');
    expect(text).not.toContain('溯源证书');
  });

  it('describes the visible trace panel as real API-backed records', () => {
    const text = source();

    expect(text).toContain('当前公开记录');
    expect(text).toContain('来自真实接口');
    expect(text).toContain('溯源节点');
  });
});
