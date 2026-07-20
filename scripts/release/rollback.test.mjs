import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  assertSafeRollbackArgs,
  parseRollbackArgs,
  rollbackApplication,
} from './rollback.mjs';

test('application rollback refuses every database reversal command and flag form', () => {
  for (const value of [
    'prisma migrate reset',
    'migrate down 20260713',
    'psql -f reverse.sql',
    'DROP TABLE users',
    'TRUNCATE TABLE audit_events',
    '--database-rollback',
    '--rollback-database',
  ]) {
    assert.throws(() => assertSafeRollbackArgs([value]), /database rollback/i);
  }
});

test('rollback CLI uses the same release runtime inputs and requires schema compatibility confirmation', () => {
  const root = join(tmpdir(), 'nongchang-rollback-cli');
  const args = [
    '--release-root', root,
    '--expected-target', 'web',
    '--node-bin', join(root, 'node20'),
    '--pm2-bin', join(root, 'pm2'),
    '--nginx-bin', join(root, 'nginx'),
    '--nginx-conf', join(root, 'nginx.conf'),
    '--hostname', 'farm.qingyouai.com',
    '--trace-code', 'trace-1',
    '--confirm-forward-schema-compatible', 'yes',
  ];
  const options = parseRollbackArgs(args, { NONGCHANG_SMOKE_ACCESS_TOKEN: 'short-lived' });
  assert.equal(options.releaseRoot, root);
  assert.equal(options.expectedTarget, 'web');
  assert.equal(options.accessToken, 'short-lived');
  assert.throws(
    () => parseRollbackArgs(args.map((value) => value === 'yes' ? 'no' : value)),
    /forward schema compatibility/i,
  );
  assert.throws(() => parseRollbackArgs([...args, '--rollback-database', 'yes']), /database rollback/i);
});

test('rollback selects deploy-state previous application and executes the shared switch transaction', async () => {
  const releaseRoot = join(tmpdir(), 'nongchang-rollback-integration');
  const activeSha = 'b'.repeat(40);
  const previousSha = 'a'.repeat(40);
  const current = {
    schemaVersion: 1,
    activePort: 3002,
    activeGitSha: activeSha,
    activeRelease: join(releaseRoot, 'releases', activeSha),
    previousPort: 3001,
    previousGitSha: previousSha,
    previousRelease: join(releaseRoot, 'releases', previousSha),
    knownStableGitSha: previousSha,
    knownStableRelease: join(releaseRoot, 'releases', previousSha),
    switchedAt: '2026-07-20T00:00:00.000Z',
  };
  const calls = [];
  let selected;
  const operations = {
    readState: async () => { calls.push('read-state'); return current; },
    captureRouting: async () => { calls.push('capture-routing'); return { activeInclude: 'active' }; },
    startCandidate: async () => { calls.push('start-candidate'); },
    smokeCandidate: async () => { calls.push('smoke-candidate'); },
    stageTraffic: async () => { calls.push('stage-traffic'); },
    validateNginx: async () => { calls.push('validate-nginx'); },
    reloadNginx: async () => { calls.push('reload-nginx'); },
    smokePublic: async () => { calls.push('smoke-public'); },
    restartWorker: async () => { calls.push('restart-worker'); },
    smokeWorker: async () => { calls.push('smoke-worker'); },
    updateLinks: async () => { calls.push('update-links'); },
    commitState: async () => { calls.push('commit-state'); },
    stopOldApi: async () => { calls.push('stop-old-api'); },
    pruneReleases: async () => { calls.push('prune-releases'); },
  };
  const result = await rollbackApplication({
    releaseRoot,
    expectedTarget: 'web',
    hostname: 'farm.qingyouai.com',
  }, {
    withReleaseLock: async (_root, task) => task(),
    readDeployState: async () => current,
    createProductionOperations: (candidate) => { selected = candidate; return operations; },
  });

  assert.equal(selected.candidateGitSha, previousSha);
  assert.equal(selected.candidatePort, 3001);
  assert.equal(selected.candidateRelease, current.previousRelease);
  assert.equal(result.state.activeGitSha, previousSha);
  assert.equal(result.state.previousGitSha, activeSha);
  assert.deepEqual(calls, [
    'read-state',
    'capture-routing',
    'start-candidate',
    'smoke-candidate',
    'stage-traffic',
    'validate-nginx',
    'reload-nginx',
    'smoke-public',
    'restart-worker',
    'smoke-worker',
    'update-links',
    'commit-state',
    'stop-old-api',
    'prune-releases',
  ]);
});

test('rollback refuses missing or incomplete previous deploy state without writing another schema', async () => {
  const releaseRoot = join(tmpdir(), 'nongchang-rollback-missing');
  const current = {
    schemaVersion: 1,
    activePort: 3001,
    activeGitSha: 'a'.repeat(40),
    activeRelease: join(releaseRoot, 'releases', 'a'.repeat(40)),
    previousPort: null,
    previousGitSha: null,
    previousRelease: null,
    knownStableGitSha: null,
    knownStableRelease: null,
    switchedAt: '2026-07-20T00:00:00.000Z',
  };
  await assert.rejects(() => rollbackApplication({ releaseRoot, expectedTarget: 'web' }, {
    withReleaseLock: async (_root, task) => task(),
    readDeployState: async () => current,
  }), /no previous application release/i);
});
