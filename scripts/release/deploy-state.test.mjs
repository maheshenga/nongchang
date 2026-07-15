import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { nextDeployState, validateDeployState, writeDeployStateAtomic } from './deploy-state.mjs';

test('deploy state switches only to the inactive blue or green port', () => {
  const current = {
    schemaVersion: 1,
    activePort: 3001,
    activeGitSha: 'a'.repeat(40),
    activeRelease: '/srv/releases/a',
    previousPort: null,
    previousGitSha: null,
    previousRelease: null,
    switchedAt: '2026-07-15T00:00:00.000Z',
  };
  const next = nextDeployState(current, {
    candidatePort: 3002,
    candidateGitSha: 'b'.repeat(40),
    candidateRelease: '/srv/releases/b',
    now: '2026-07-15T01:00:00.000Z',
  });
  assert.equal(next.activePort, 3002);
  assert.equal(next.previousPort, 3001);
  assert.equal(next.previousGitSha, 'a'.repeat(40));
  assert.throws(() => nextDeployState(current, {
    candidatePort: 3001,
    candidateGitSha: 'b'.repeat(40),
    candidateRelease: '/srv/releases/b',
  }), /inactive port/);
  assert.throws(() => nextDeployState(current, {
    candidatePort: 3002,
    candidateGitSha: 'short',
    candidateRelease: '/srv/releases/b',
  }), /40-character Git SHA/);
});

test('deploy state rejects partial previous and known-stable references', () => {
  const state = nextDeployState(null, {
    candidatePort: 3001,
    candidateGitSha: 'a'.repeat(40),
    candidateRelease: '/srv/releases/a',
  });
  assert.throws(() => validateDeployState({
    ...state,
    previousGitSha: 'b'.repeat(40),
    previousRelease: null,
  }), /previous.*complete/i);
  assert.throws(() => validateDeployState({
    ...state,
    knownStableGitSha: null,
    knownStableRelease: '/srv/releases/stable',
  }), /known-stable.*complete/i);
});

test('deploy state is written atomically without leaving temporary files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nongchang-deploy-state-'));
  try {
    const stateFile = join(dir, 'deploy-state.json');
    const state = nextDeployState(null, {
      candidatePort: 3001,
      candidateGitSha: 'c'.repeat(40),
      candidateRelease: '/srv/releases/c',
      now: '2026-07-15T02:00:00.000Z',
    });
    await writeDeployStateAtomic(stateFile, state);
    assert.deepEqual(JSON.parse(await readFile(stateFile, 'utf8')), state);
    assert.deepEqual(await readdir(dir), ['deploy-state.json']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
