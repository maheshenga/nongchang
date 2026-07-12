import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/components/BatchAdmin.tsx'), 'utf8');

describe('BatchAdmin module boundary', () => {
  it('keeps the page coordinator below 500 lines', () => {
    expect(source.split(/\r?\n/).length).toBeLessThan(501);
  });

  it.each([
    './batch-admin/BatchTable',
    './batch-admin/BatchLifecycleDialog',
    './batch-admin/BatchLabelWorkspace',
    './batch-admin/CreateBatchModal',
  ])('imports %s', (modulePath) => {
    expect(source).toContain(modulePath);
  });
});
