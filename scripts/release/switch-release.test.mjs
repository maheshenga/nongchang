import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertNode20Version,
  assertSwitchCandidateArtifact,
  executeReleaseSwitch,
  nextDeployState,
  releaseProcessName,
  renderActiveApi,
  validateDeployState,
  withReleaseLock,
} from './switch-release.mjs';

const currentState = {
  schemaVersion: 1,
  activePort: 3001,
  activeGitSha: 'a'.repeat(40),
  activeRelease: `/srv/farm/releases/${'a'.repeat(40)}`,
  previousPort: 3002,
  previousGitSha: 'c'.repeat(40),
  previousRelease: `/srv/farm/releases/${'c'.repeat(40)}`,
  knownStableGitSha: 'd'.repeat(40),
  knownStableRelease: `/srv/farm/releases/${'d'.repeat(40)}`,
  switchedAt: '2026-07-15T00:00:00.000Z',
};

const candidate = {
  candidatePort: 3002,
  candidateGitSha: 'b'.repeat(40),
  candidateRelease: `/srv/farm/releases/${'b'.repeat(40)}`,
  now: '2026-07-15T01:00:00.000Z',
};

function createOperations({ publicSmokeError, workerError } = {}) {
  const calls = [];
  return {
    calls,
    readState: async () => { calls.push('read-state'); return currentState; },
    captureRouting: async () => { calls.push('capture-routing'); return { activeInclude: 'old upstream', currentRelease: currentState.activeRelease }; },
    startCandidate: async () => { calls.push('start-candidate'); },
    smokeCandidate: async () => { calls.push('smoke-candidate'); },
    stageTraffic: async () => { calls.push('stage-traffic'); },
    validateNginx: async () => { calls.push('validate-nginx'); },
    reloadNginx: async () => { calls.push('reload-nginx'); },
    smokePublic: async () => {
      calls.push('smoke-public');
      if (publicSmokeError) throw publicSmokeError;
    },
    restoreTraffic: async () => { calls.push('restore-traffic'); },
    updatePrevious: async () => { calls.push('update-previous'); },
    commitState: async () => { calls.push('commit-state'); },
    stopOldApi: async () => { calls.push('stop-old-api'); },
    restartWorker: async () => {
      calls.push('restart-worker');
      if (workerError) throw workerError;
    },
    smokeWorker: async () => { calls.push('smoke-worker'); },
    pruneReleases: async () => { calls.push('prune-releases'); },
    cleanupCandidate: async () => { calls.push('cleanup-candidate'); },
  };
}

test('switch accepts only Node 20, Web artifacts, and blue/green ports', async () => {
  assert.doesNotThrow(() => assertNode20Version('v20.19.4'));
  assert.throws(() => assertNode20Version('v24.4.1'), /Node\.js 20/);
  assert.equal(releaseProcessName(3001), 'nongchang-api-blue');
  assert.equal(releaseProcessName(3002), 'nongchang-api-green');
  assert.throws(() => releaseProcessName(3003), /3001 or 3002/);
  assert.equal(renderActiveApi(3002), 'proxy_pass http://127.0.0.1:3002;\n');

  const root = await mkdtemp(join(tmpdir(), 'nongchang-switch-target-'));
  const gitSha = 'e'.repeat(40);
  try {
    await writeFile(join(root, 'artifact-manifest.json'), JSON.stringify({
      schemaVersion: 2,
      target: 'miniapp',
      gitSha,
      provenance: { platform: 'linux', arch: 'x64' },
      files: {},
    }));
    await assert.rejects(
      () => assertSwitchCandidateArtifact({ candidateRelease: root, candidateGitSha: gitSha, expectedTarget: 'web' }),
      /target does not match/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('deploy state records application artifacts only and requires the inactive port', () => {
  const next = nextDeployState(currentState, candidate);
  assert.deepEqual(validateDeployState(next), next);
  assert.equal(next.activeGitSha, candidate.candidateGitSha);
  assert.equal(next.previousGitSha, currentState.activeGitSha);
  assert.deepEqual(Object.keys(next).filter((key) => /database|migration|sql/i.test(key)), []);
  assert.throws(() => nextDeployState(currentState, { ...candidate, candidatePort: 3001 }), /inactive port/);
});

test('release switch validates, routes, smokes, commits, and then updates worker lifecycle', async () => {
  const operations = createOperations();
  const result = await executeReleaseSwitch(candidate, operations);

  assert.equal(result.status, 'ok');
  assert.equal(result.state.activePort, 3002);
  assert.deepEqual(operations.calls, [
    'read-state',
    'capture-routing',
    'start-candidate',
    'smoke-candidate',
    'stage-traffic',
    'validate-nginx',
    'reload-nginx',
    'smoke-public',
    'update-previous',
    'commit-state',
    'stop-old-api',
    'restart-worker',
    'smoke-worker',
    'prune-releases',
  ]);
});

test('public smoke failure restores old routing and never commits candidate state', async () => {
  const operations = createOperations({ publicSmokeError: new Error('public route is unhealthy') });
  await assert.rejects(() => executeReleaseSwitch(candidate, operations), /public route is unhealthy/);
  assert.deepEqual(operations.calls, [
    'read-state',
    'capture-routing',
    'start-candidate',
    'smoke-candidate',
    'stage-traffic',
    'validate-nginx',
    'reload-nginx',
    'smoke-public',
    'restore-traffic',
    'reload-nginx',
    'cleanup-candidate',
  ]);
  assert.equal(operations.calls.includes('commit-state'), false);
});

test('worker failure reports degraded state without reversing verified API traffic', async () => {
  const operations = createOperations({ workerError: new Error('worker did not start') });
  await assert.rejects(
    () => executeReleaseSwitch(candidate, operations),
    /traffic is active but post-switch lifecycle failed: worker did not start/,
  );
  assert.equal(operations.calls.includes('commit-state'), true);
  assert.equal(operations.calls.includes('restore-traffic'), false);
  assert.equal(operations.calls.includes('prune-releases'), false);
});

test('release lock refuses concurrent switches and is removed after completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-release-lock-'));
  let releaseFirst;
  let markEntered;
  const entered = new Promise((resolveEntered) => { markEntered = resolveEntered; });
  const hold = new Promise((resolveHold) => { releaseFirst = resolveHold; });
  try {
    const first = withReleaseLock(root, async () => {
      markEntered();
      await hold;
      return 'done';
    });
    await entered;
    await assert.rejects(() => withReleaseLock(root, async () => 'second'), /another release switch is already running/);
    releaseFirst();
    assert.equal(await first, 'done');
    assert.deepEqual(await readdir(root), []);
  } finally {
    releaseFirst?.();
    await rm(root, { recursive: true, force: true });
  }
});
