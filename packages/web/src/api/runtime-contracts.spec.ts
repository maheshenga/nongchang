import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const priorityModules = [
  'auth.ts', 'ai.ts', 'billing.ts', 'supply.ts', 'user-group.ts',
  'quick-template.ts', 'integration.ts', 'oss-config.ts', 'uploads.ts', 'phenology.ts',
];

describe('priority web API runtime contracts', () => {
  it.each(priorityModules)('%s parses unknown transport data at the module boundary', (file) => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    expect(source).toContain('parseResponse');
    expect(source).not.toMatch(/request<(?!unknown\b)[^>]+>/);
    expect(source).not.toMatch(/response\.json\(\)\) as /);
  });
});
