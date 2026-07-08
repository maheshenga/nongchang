import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = ['BillingPlans.tsx', 'BillingLedger.tsx', 'BillingAlipayConfig.tsx', 'PayResult.tsx'];
const legacyTokens = [
  'rounded-xl',
  'rounded-2xl',
  'bg-emerald-600',
  'hover:bg-emerald-700',
  'border-slate',
  'text-slate',
  'bg-slate',
];
const mojibakeTokens = [
  '鏀',
  '濂',
  '璐',
  '绠',
  '鐮',
  '鐘',
  '椤',
  '鈥',
  '姝',
  '灏',
  '閺',
  '婵',
  '鐠',
  '缁',
  '閻',
  '妞',
  '閳',
];

describe('billing Fluent surface boundaries', () => {
  for (const file of files) {
    it(`${file} uses shared Fluent primitives and readable text`, () => {
      const source = readFileSync(resolve(__dirname, file), 'utf8');

      expect(source).toContain("from '../ui/fluent'");
      expect(source).toMatch(/fluent(Button|Input|Select|Table|StatusTag)/);
      for (const token of legacyTokens) expect(source).not.toContain(token);
      for (const token of mojibakeTokens) expect(source).not.toContain(token);
    });
  }
});
