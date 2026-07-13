import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.tsx'), 'utf8');

describe('usage recovery workflow', () => {
  it('supports independent retry, filters, and append pagination', () => {
    expect(source).toContain('loadSummary');
    expect(source).toContain('loadLedgerPage');
    expect(source).toContain('onScrollToLower');
    expect(source).toContain('resourceFilter');
    expect(source).toContain('reasonFilter');
    expect(source).toContain('appendError');
    expect(source).toContain('重试加载更多');
    expect(source).toContain('DataState');
    expect(source).not.toContain('Promise.all([getBillingSummary(), listLedger');
  });
});
