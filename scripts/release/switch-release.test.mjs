import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import {
  assertNode20Version,
  assertSwitchCandidateArtifact,
  createProductionOperations,
  executeReleaseSwitch,
  nextDeployState,
  parseSwitchArgs,
  releaseProcessName,
  renderActiveRelease,
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
    captureRouting: async () => { calls.push('capture-routing'); return { activeInclude: 'old route', currentRelease: currentState.activeRelease }; },
    startCandidate: async () => { calls.push('start-candidate'); },
    smokeCandidate: async () => { calls.push('smoke-candidate'); },
    stageTraffic: async () => { calls.push('stage-traffic'); },
    validateNginx: async () => { calls.push('validate-nginx'); },
    reloadNginx: async () => { calls.push('reload-nginx'); },
    smokePublic: async () => {
      calls.push('smoke-public');
      if (publicSmokeError) throw publicSmokeError;
    },
    restartWorker: async () => { calls.push('restart-worker'); },
    smokeWorker: async () => {
      calls.push('smoke-worker');
      if (workerError) throw workerError;
    },
    updateLinks: async () => { calls.push('update-links'); },
    commitState: async () => { calls.push('commit-state'); },
    restoreTraffic: async () => { calls.push('restore-traffic'); },
    restoreWorker: async () => { calls.push('restore-worker'); },
    stopOldApi: async () => { calls.push('stop-old-api'); },
    pruneReleases: async () => { calls.push('prune-releases'); },
    cleanupCandidate: async () => { calls.push('cleanup-candidate'); },
  };
}

test('switch accepts only Node 20, Web artifacts, and a combined immutable Web/API route', async () => {
  assert.doesNotThrow(() => assertNode20Version('v20.19.4'));
  assert.throws(() => assertNode20Version('v24.4.1'), /Node\.js 20/);
  assert.equal(releaseProcessName(3001), 'nongchang-api-blue');
  assert.equal(releaseProcessName(3002), 'nongchang-api-green');
  assert.throws(() => releaseProcessName(3003), /3001 or 3002/);
  assert.equal(
    renderActiveRelease('/srv/farm/releases/' + 'b'.repeat(40), 3002),
    `root "/srv/farm/releases/${'b'.repeat(40)}/web";\nset $nongchang_api_origin http://127.0.0.1:3002;\n`,
  );

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

test('switch CLI requires full runtime paths and resolves the candidate from its full SHA', () => {
  const root = join(tmpdir(), 'nongchang-cli-root');
  const sha = 'b'.repeat(40);
  const options = parseSwitchArgs([
    '--release-root', root,
    '--candidate-port', '3002',
    '--candidate-sha', sha,
    '--expected-target', 'web',
    '--node-bin', join(root, 'node20'),
    '--pm2-bin', join(root, 'pm2'),
    '--nginx-bin', join(root, 'nginx'),
    '--nginx-conf', join(root, 'nginx.conf'),
    '--hostname', 'farm.qingyouai.com',
    '--trace-code', 'trace-1',
  ], { NONGCHANG_SMOKE_ACCESS_TOKEN: 'short-lived' });
  assert.equal(options.candidateRelease, join(root, 'releases', sha));
  assert.equal(options.candidatePort, 3002);
  assert.equal(options.accessToken, 'short-lived');
  assert.throws(() => parseSwitchArgs(['--database-rollback', 'yes']), /unknown release switch argument/);
});

test('deploy state records application artifacts only and requires the inactive port', () => {
  const next = nextDeployState(currentState, candidate);
  assert.deepEqual(validateDeployState(next), next);
  assert.equal(next.activeGitSha, candidate.candidateGitSha);
  assert.equal(next.previousGitSha, currentState.activeGitSha);
  assert.deepEqual(Object.keys(next).filter((key) => /database|migration|sql/i.test(key)), []);
  assert.throws(() => nextDeployState(currentState, { ...candidate, candidatePort: 3001 }), /inactive port/);
});

test('release switch commits links and state only after public and worker health pass', async () => {
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
    'restart-worker',
    'smoke-worker',
    'update-links',
    'commit-state',
    'stop-old-api',
    'prune-releases',
  ]);
});

test('public smoke failure restores old serving route and never mutates links or state', async () => {
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
  assert.equal(operations.calls.includes('update-links'), false);
});

test('worker health failure restores prior route and worker before leaving state unchanged', async () => {
  const operations = createOperations({ workerError: new Error('worker did not start') });
  await assert.rejects(() => executeReleaseSwitch(candidate, operations), /worker did not start/);
  assert.deepEqual(operations.calls, [
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
    'restore-traffic',
    'reload-nginx',
    'restore-worker',
    'cleanup-candidate',
  ]);
  assert.equal(operations.calls.includes('commit-state'), false);
});

async function createProductionFixture({ failCandidateWorker = false } = {}) {
  const releaseRoot = await mkdtemp(join(tmpdir(), 'nongchang-production-switch-'));
  const oldSha = 'a'.repeat(40);
  const newSha = 'b'.repeat(40);
  const oldRelease = join(releaseRoot, 'releases', oldSha);
  const newRelease = join(releaseRoot, 'releases', newSha);
  const shared = join(releaseRoot, 'shared');
  const currentLink = join(releaseRoot, 'current');
  const previousLink = join(releaseRoot, 'previous');
  const activeInclude = join(shared, 'active-release.conf');
  const stateFile = join(releaseRoot, 'deploy-state.json');
  for (const release of [oldRelease, newRelease]) {
    await mkdir(join(release, 'backend', 'src'), { recursive: true });
    await mkdir(join(release, 'web'), { recursive: true });
    await mkdir(join(release, 'ops', 'pm2'), { recursive: true });
    await writeFile(join(release, 'backend', 'src', 'main.js'), 'main');
    await writeFile(join(release, 'web', 'index.html'), 'web');
    await writeFile(join(release, 'ops', 'pm2', 'ecosystem.config.cjs'), 'module.exports = {};');
  }
  await writeFile(join(newRelease, 'artifact-manifest.json'), JSON.stringify({
    schemaVersion: 2,
    target: 'web',
    gitSha: newSha,
    provenance: { platform: 'linux', arch: 'x64' },
    files: {},
  }));
  const state = {
    schemaVersion: 1,
    activePort: 3001,
    activeGitSha: oldSha,
    activeRelease: oldRelease,
    previousPort: null,
    previousGitSha: null,
    previousRelease: null,
    knownStableGitSha: null,
    knownStableRelease: null,
    switchedAt: '2026-07-15T00:00:00.000Z',
  };
  await mkdir(shared, { recursive: true });
  await writeFile(activeInclude, renderActiveRelease(oldRelease, 3001));
  await writeFile(stateFile, JSON.stringify(state));
  await symlink(oldRelease, currentLink, 'dir');

  const commands = [];
  const smokes = [];
  const nodeBin = join(releaseRoot, 'bin', 'node20');
  const pm2Bin = join(releaseRoot, 'bin', 'pm2');
  const nginxBin = join(releaseRoot, 'bin', 'nginx');
  const nginxConf = join(releaseRoot, 'nginx.conf');
  const options = {
    releaseRoot,
    candidatePort: 3002,
    candidateGitSha: newSha,
    candidateRelease: newRelease,
    nodeBin,
    pm2Bin,
    nginxBin,
    nginxConf,
    hostname: 'farm.qingyouai.com',
    expectedTarget: 'web',
  };
  let nginxCalls = 0;
  const runCommand = async (command, args, commandOptions = {}) => {
    commands.push({ command, args, env: commandOptions.env });
    if (command === nodeBin) return { code: 0, stdout: 'v20.19.4\n', stderr: '' };
    if (command === nginxBin) {
      nginxCalls += 1;
      assert.equal(await readlink(currentLink), oldRelease, 'serving current link changed before Nginx transaction completed');
      assert.equal(
        await readFile(activeInclude, 'utf8'),
        nginxCalls <= 2 ? renderActiveRelease(newRelease, 3002) : renderActiveRelease(oldRelease, 3001),
      );
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  const runSmoke = async (smoke) => {
    smokes.push(smoke);
    if (smoke.baseUrl === 'https://farm.qingyouai.com') {
      assert.equal(await readlink(currentLink), oldRelease, 'public smoke must precede convenience link changes');
    }
    if (smoke.baseUrl === 'http://127.0.0.1:3003' && smoke.expectedSha === newSha && failCandidateWorker) {
      throw new Error('candidate worker unhealthy');
    }
    return { status: 'ok', deployedGitSha: smoke.expectedSha };
  };
  return {
    releaseRoot,
    oldSha,
    newSha,
    oldRelease,
    newRelease,
    currentLink,
    previousLink,
    activeInclude,
    stateFile,
    state,
    options,
    commands,
    smokes,
    operations: createProductionOperations(options, { runCommand, runSmoke }),
  };
}

test('production operations atomically route immutable Web and API before updating convenience links', async () => {
  const fixture = await createProductionFixture();
  try {
    await executeReleaseSwitch(fixture.options, fixture.operations);
    assert.equal(await readFile(fixture.activeInclude, 'utf8'), renderActiveRelease(fixture.newRelease, 3002));
    assert.equal(await readlink(fixture.currentLink), fixture.newRelease);
    assert.equal(await readlink(fixture.previousLink), fixture.oldRelease);
    const state = JSON.parse(await readFile(fixture.stateFile, 'utf8'));
    assert.equal(state.activeGitSha, fixture.newSha);
    assert.deepEqual(fixture.commands.map(({ command, args }) => [basename(command), ...args]), [
      ['node20', '--version'],
      ['pm2', 'delete', 'nongchang-api-green'],
      ['pm2', 'start', join(fixture.newRelease, 'ops', 'pm2', 'ecosystem.config.cjs'), '--only', 'nongchang-api-green', '--update-env'],
      ['nginx', '-t', '-c', fixture.options.nginxConf],
      ['nginx', '-s', 'reload', '-c', fixture.options.nginxConf],
      ['pm2', 'startOrRestart', join(fixture.newRelease, 'ops', 'pm2', 'ecosystem.config.cjs'), '--only', 'nongchang-worker', '--update-env'],
      ['pm2', 'stop', 'nongchang-api-blue'],
    ]);
    assert.deepEqual(fixture.smokes.map(({ baseUrl, expectedSha }) => [baseUrl, expectedSha]), [
      ['http://127.0.0.1:3002', fixture.newSha],
      ['https://farm.qingyouai.com', fixture.newSha],
      ['http://127.0.0.1:3003', fixture.newSha],
    ]);
  } finally {
    await rm(fixture.releaseRoot, { recursive: true, force: true });
  }
});

test('production worker failure restores serving route, current link, worker, and deploy state', async () => {
  const fixture = await createProductionFixture({ failCandidateWorker: true });
  try {
    await assert.rejects(() => executeReleaseSwitch(fixture.options, fixture.operations), /candidate worker unhealthy/);
    assert.equal(await readFile(fixture.activeInclude, 'utf8'), renderActiveRelease(fixture.oldRelease, 3001));
    assert.equal(await readlink(fixture.currentLink), fixture.oldRelease);
    assert.deepEqual(JSON.parse(await readFile(fixture.stateFile, 'utf8')), fixture.state);
    assert.equal(fixture.commands.some(({ args }) => args.includes(join(fixture.oldRelease, 'ops', 'pm2', 'ecosystem.config.cjs'))), true);
    assert.equal(fixture.smokes.some(({ baseUrl, expectedSha }) => baseUrl === 'http://127.0.0.1:3003' && expectedSha === fixture.oldSha), true);
  } finally {
    await rm(fixture.releaseRoot, { recursive: true, force: true });
  }
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
