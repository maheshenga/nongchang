import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'WorkQuickActions.tsx');
const source = readFileSync(sourcePath, 'utf8');

describe('WorkQuickActions truthful copy', () => {
  it('does not describe the reserved location action as blockchain capability', () => {
    expect(source).not.toMatch(/区块链|上链|哈希|存证/);
    expect(source).toContain('地块定位');
    expect(source).toContain('位置记录请在农事表单中保存');
  });
});
