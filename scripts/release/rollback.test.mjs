import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSafeRollbackArgs } from './rollback.mjs';

test('application rollback refuses database reversal commands', () => {
  for (const value of [
    'prisma migrate reset',
    'migrate down 20260713',
    'psql -f reverse.sql',
    'DROP TABLE users',
    '--database-rollback',
  ]) {
    assert.throws(() => assertSafeRollbackArgs([value]), /database rollback/i);
  }
});

test('application rollback accepts only an immutable artifact and manifest', () => {
  assert.doesNotThrow(() => assertSafeRollbackArgs(['--artifact', 'nongchang-abc123.tar.gz', '--manifest', 'manifest.json']));
});
