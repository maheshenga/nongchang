import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  executeReleaseSwitch,
  assertNode20Version,
  assertRoutingState,
  releaseProcessName,
  selectReleasesToPrune,
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

function createOperations({ publicSmokeError, workerError } = {}) {
  const calls = [];
  const operations = {
    calls,
    readState: async () => {
      calls.push('read-state');
      return currentState;
    },
    captureRouting: async () => {
      calls.push('capture-routing');
      return { activeInclude: 'old upstream', currentRelease: currentState.activeRelease };
    },
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
    pruneReleases: async () => { calls.push('prune-releases'); },
    cleanupCandidate: async () => { calls.push('cleanup-candidate'); },
  };
  return operations;
}

test('partial candidate start and traffic staging failures still run safe cleanup', async () => {
  const startFailure = createOperations();
  startFailure.startCandidate = async () => {
    startFailure.calls.push('start-candidate');
    throw new Error('PM2 start failed after creating the process');
  };
  await assert.rejects(() => executeReleaseSwitch(candidate, startFailure), /PM2 start failed/);
  assert.deepEqual(startFailure.calls, [
    'read-state',
    'capture-routing',
    'start-candidate',
    'cleanup-candidate',
  ]);

  const stageFailure = createOperations();
  stageFailure.stageTraffic = async () => {
    stageFailure.calls.push('stage-traffic');
    throw new Error('symlink update failed after include write');
  };
  await assert.rejects(() => executeReleaseSwitch(candidate, stageFailure), /symlink update failed/);
  assert.deepEqual(stageFailure.calls, [
    'read-state',
    'capture-routing',
    'start-candidate',
    'smoke-candidate',
    'stage-traffic',
    'restore-traffic',
    'cleanup-candidate',
  ]);
});

const candidate = {
  candidatePort: 3002,
  candidateGitSha: 'b'.repeat(40),
  candidateRelease: `/srv/farm/releases/${'b'.repeat(40)}`,
  now: '2026-07-15T01:00:00.000Z',
};

test('production switch refuses the wrong Node major and stale routing without deploy state', () => {
  assert.doesNotThrow(() => assertNode20Version('v20.19.4'));
  assert.throws(() => assertNode20Version('v24.4.1'), /Node\.js 20/);
  assert.throws(() => assertNode20Version('unknown'), /Node\.js 20/);

  assert.doesNotThrow(() => assertRoutingState(null, {
    activeInclude: 'proxy_pass http://127.0.0.1:3001;\n',
    currentRelease: null,
    previousRelease: null,
  }, 'C:\\farm'));
  assert.throws(() => assertRoutingState(null, {
    activeInclude: 'proxy_pass http://127.0.0.1:3001;\n',
    currentRelease: 'C:\\farm\\releases\\stale',
    previousRelease: null,
  }, 'C:\\farm'), /deploy state is missing/i);
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

test('release switch validates candidate before atomically routing and committing state', async () => {
  const operations = createOperations();
  const result = await executeReleaseSwitch(candidate, operations);

  assert.equal(result.status, 'ok');
  assert.equal(result.state.activePort, 3002);
  assert.equal(result.state.previousRelease, currentState.activeRelease);
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
    'prune-releases',
  ]);
});

test('public smoke failure restores old routing and removes only the failed candidate', async () => {
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
  assert.equal(operations.calls.includes('stop-old-api'), false);
});

test('worker restart failure leaves the verified API switch committed but reports degraded state', async () => {
  const operations = createOperations({ workerError: new Error('worker did not start') });

  await assert.rejects(
    () => executeReleaseSwitch(candidate, operations),
    /traffic is active but post-switch lifecycle failed: worker did not start/,
  );
  assert.equal(operations.calls.includes('commit-state'), true);
  assert.equal(operations.calls.includes('restore-traffic'), false);
  assert.equal(operations.calls.includes('prune-releases'), false);
});

test('release process names and retention protect current, previous, and known-stable releases', () => {
  assert.equal(releaseProcessName(3001), 'nongchang-api-blue');
  assert.equal(releaseProcessName(3002), 'nongchang-api-green');
  assert.throws(() => releaseProcessName(3003), /3001 or 3002/);

  const releaseA = `/srv/farm/releases/${'a'.repeat(40)}`;
  const releaseB = `/srv/farm/releases/${'b'.repeat(40)}`;
  const releaseC = `/srv/farm/releases/${'c'.repeat(40)}`;
  const releaseD = `/srv/farm/releases/${'d'.repeat(40)}`;
  const releases = [
    { path: releaseA, mtimeMs: 1 },
    { path: releaseB, mtimeMs: 4 },
    { path: releaseC, mtimeMs: 3 },
    { path: releaseD, mtimeMs: 2 },
    { path: '/srv/farm/releases/not-a-sha', mtimeMs: 0 },
  ];
  assert.deepEqual(
    selectReleasesToPrune(releases, new Set([
      releaseB,
      releaseC,
      releaseD,
    ])),
    [releaseA],
  );
});
