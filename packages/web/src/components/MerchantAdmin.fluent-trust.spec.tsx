import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(join(process.cwd(), 'src/components/MerchantAdmin.tsx'), 'utf8');

const legacyTokens = [
  'rounded-xl',
  'rounded-2xl',
  'bg-emerald',
  'hover:bg-emerald',
  'border-slate',
  'text-slate',
  'bg-slate',
  'shadow-xl',
  'shadow-2xl',
  'bg-gradient-to-r',
  'shadow-emerald',
];

const unsupportedClaims = [
  '权威质检',
  'PASSED',
  'zero-knowledge',
  'OAUTH',
  '地理标志',
  '全网唯一',
  '加密证明能力',
];

describe('MerchantAdmin Fluent trust boundary', () => {
  it('uses shared Fluent primitives and avoids legacy styling or unsupported trace-label claims', () => {
    const text = source();

    expect(text).toContain("from '../ui/fluent'");
    expect(text).toContain("from '../ui/state'");
    expect(text).toMatch(/fluent(Button|Input|StatusTag|Table)/);
    expect(text).toMatch(/(LoadingState|EmptyState|ErrorState)/);

    for (const token of legacyTokens) expect(text).not.toContain(token);
    for (const claim of unsupportedClaims) expect(text).not.toContain(claim);
  });
});
