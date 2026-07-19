import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const priorityModules = ['auth.ts', 'ai.ts', 'billing.ts', 'quickTemplate.ts'];

describe('priority miniapp API runtime contracts', () => {
  it.each(priorityModules)('%s parses unknown transport data at the module boundary', (file) => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    expect(source).toContain('parseResponse');
    expect(source).not.toMatch(/request<(?!unknown\b)[^>]+>/);
    expect(source).not.toMatch(/JSON\.parse\([^)]*\) as /);
  });
});
