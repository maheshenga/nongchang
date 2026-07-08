import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'LogisticsTracker.tsx');

describe('LogisticsTracker Fluent UI', () => {
  it('keeps the supply workflow inside the Fluent UI boundary', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain("from '../ui/fluent'");
    expect(source).toContain("from '../ui/state'");
    expect(source).toContain('fluentButton');
    expect(source).toContain('fluentInput');
    expect(source).toContain('fluentSelect');
    expect(source).toContain('fluentStatusTag');
    expect(source).toContain('LoadingState');
    expect(source).toContain('ErrorState');
    expect(source).toContain('EmptyState');

    const forbiddenClassTokens = [
      'text-slate-',
      'bg-slate-',
      'border-slate-',
      'ring-slate-',
      'text-cyan-',
      'bg-cyan-',
      'border-cyan-',
      'focus:ring-cyan-',
      'text-red-',
      'bg-red-',
      'border-red-',
      'rounded-xl',
      'rounded-lg',
      'shadow-xl',
      'shadow-2xl',
    ];

    for (const token of forbiddenClassTokens) {
      expect(source).not.toContain(token);
    }
  });
});
