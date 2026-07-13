import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCleanWorktree, verifyArtifactManifest } from './build-artifact.mjs';

test('release artifacts refuse a dirty worktree', () => {
  assert.throws(() => assertCleanWorktree(' M packages/backend/src/main.ts\n'), /clean worktree/i);
  assert.doesNotThrow(() => assertCleanWorktree(''));
});

test('artifact manifest verification rejects Git SHA or hash drift', () => {
  const manifest = {
    schemaVersion: 1,
    gitSha: 'abc123',
    files: { 'backend/app.js': 'a'.repeat(64) },
  };
  assert.throws(() => verifyArtifactManifest(manifest, 'different', manifest.files), /Git SHA/i);
  assert.throws(
    () => verifyArtifactManifest(manifest, 'abc123', { 'backend/app.js': 'b'.repeat(64) }),
    /hash mismatch/i,
  );
  assert.doesNotThrow(() => verifyArtifactManifest(manifest, 'abc123', manifest.files));
});
