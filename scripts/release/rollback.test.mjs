import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSafeRollbackArgs,
  assertSchemaCompatibilityAcknowledged,
  rollbackCandidate,
} from './rollback.mjs';

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

test('application rollback requires an explicit forward-schema compatibility acknowledgement', () => {
  assert.doesNotThrow(() => assertSchemaCompatibilityAcknowledged('yes'));
  assert.throws(() => assertSchemaCompatibilityAcknowledged('true'), /forward schema compatibility/i);
});

test('application rollback selects only the immutable previous release and inactive port', () => {
  const releaseRoot = '/srv/farm';
  const previousGitSha = 'b'.repeat(40);
  const candidate = rollbackCandidate({
    schemaVersion: 1,
    activePort: 3002,
    activeGitSha: 'a'.repeat(40),
    activeRelease: `${releaseRoot}/releases/${'a'.repeat(40)}`,
    previousPort: 3001,
    previousGitSha,
    previousRelease: `${releaseRoot}/releases/${previousGitSha}`,
    switchedAt: '2026-07-15T00:00:00.000Z',
  }, releaseRoot);
  assert.deepEqual(candidate, {
    candidatePort: 3001,
    candidateGitSha: previousGitSha,
    candidateRelease: `${releaseRoot}/releases/${previousGitSha}`,
  });
  assert.throws(() => rollbackCandidate({ ...candidate, schemaVersion: 1 }, releaseRoot), /deploy state/i);
});
