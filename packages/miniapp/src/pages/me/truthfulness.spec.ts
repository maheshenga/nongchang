import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'index.tsx');
const source = readFileSync(sourcePath, 'utf8');

describe('Me page truthful copy', () => {
  it('uses traceability record copy instead of blockchain storage claims', () => {
    expect(source).not.toMatch(/区块链|上链|哈希|存证/);
    expect(source).toContain('溯源记录');
  });
});
