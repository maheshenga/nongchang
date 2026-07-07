import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const userVisibleFiles = [
  '../index.html',
  'navigation.ts',
  'components/AppLogin.tsx',
  'components/BillingAdmin.tsx',
  'components/FarmRecords.tsx',
];

const mojibakePattern = /鍐|鐢|绉|骞|鎴|杩|鏁|浠|妯|璁|荤|�/;

describe('user-visible text integrity', () => {
  it('keeps critical SaaS surfaces free of common mojibake markers', () => {
    const offenders = userVisibleFiles.flatMap((file) => {
      const source = readFileSync(resolve(__dirname, file), 'utf8');
      return mojibakePattern.test(source) ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });
});
