import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(join(process.cwd(), 'src/components/SystemAdmin.tsx'), 'utf8');

describe('SystemAdmin Fluent UI shell', () => {
  it('uses shared Fluent primitives instead of legacy card shell utilities', () => {
    const text = source();

    expect(text).toContain("from '../ui/fluent'");
    expect(text).toContain('fluentButton');
    expect(text).toContain('fluentInput');
    expect(text).toContain('fluentSelect');
    expect(text).toContain('fluentStatusTag');
    expect(text).toContain('fluentStatusTag(');
    expect(text).toContain('fluentTable');
    expect(text).toContain('fluentTable.th');
    expect(text).toContain('fluentTable.td');

    expect(text).not.toContain('rounded-2xl');
    expect(text).not.toContain('rounded-xl');
    expect(text).not.toContain('shadow-lg');
    expect(text).not.toContain('shadow-md');
    expect(text).not.toContain('bg-emerald-600 hover:bg-emerald-700');
    expect(text).not.toContain('bg-slate-50/70');
  });
});
