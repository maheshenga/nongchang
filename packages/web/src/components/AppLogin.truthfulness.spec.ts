import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'AppLogin.tsx');
const source = readFileSync(sourcePath, 'utf8');

describe('AppLogin truthful marketing copy', () => {
  it('does not promise unimplemented storage or blockchain trust capabilities', () => {
    expect(source).not.toMatch(/区块链|上链|哈希|存证/);
    expect(source).toContain('全链路资料留档');
  });
});
