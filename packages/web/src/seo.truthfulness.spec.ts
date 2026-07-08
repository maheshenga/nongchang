import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(webRoot, 'index.html'), 'utf8');

describe('SEO truthful copy', () => {
  it('does not advertise storage/deposit or blockchain capabilities in metadata', () => {
    expect(source).not.toMatch(/区块链|上链|哈希|存证/);
    expect(source).toContain('资质文件管理');
    expect(source).toContain('资料留档');
  });
});
