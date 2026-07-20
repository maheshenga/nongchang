import { spawn } from 'node:child_process';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertReleaseSha, assertWebReleaseTarget } from './artifact-contract.mjs';
import { runSmoke } from './smoke.mjs';
import { readAndAssertArtifactManifest } from './verify-artifact.mjs';

const RELEASE_NAME = /^[0-9a-f]{40}$/;
const ALLOWED_API_PORTS = new Set([3001, 3002]);

function assertAbsoluteReleasePath(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new Error(`${label} must be an absolute release path`);
  }
}

export function releaseProcessName(port) {
  const numericPort = Number(port);
  if (numericPort === 3001) return 'nongchang-api-blue';
  if (numericPort === 3002) return 'nongchang-api-green';
  throw new Error('release API port must be 3001 or 3002');
}

export function assertNode20Version(version) {
  if (!/^v20\./.test(String(version).trim())) {
    throw new Error('production release requires the dedicated Node.js 20 binary');
  }
}

export function renderActiveRelease(releasePath, port) {
  assertAbsoluteReleasePath(releasePath, 'active release');
  const numericPort = Number(port);
  if (!ALLOWED_API_PORTS.has(numericPort)) throw new Error('active API port must be 3001 or 3002');
  const webRoot = `${releasePath.replaceAll('\\', '/').replace(/\/$/, '')}/web`.replaceAll('"', '\\"');
  return `root "${webRoot}";\nset $nongchang_api_origin http://127.0.0.1:${numericPort};\n`;
}

export function validateDeployState(state) {
  if (!state || state.schemaVersion !== 1) throw new Error('deploy state schemaVersion must be 1');
  if (!ALLOWED_API_PORTS.has(state.activePort)) throw new Error('deploy state activePort must be 3001 or 3002');
  assertReleaseSha(state.activeGitSha);
  assertAbsoluteReleasePath(state.activeRelease, 'activeRelease');

  const previousValues = [state.previousPort, state.previousGitSha, state.previousRelease];
  const previousPresent = previousValues.filter((value) => value !== null && value !== undefined).length;
  if (previousPresent !== 0 && previousPresent !== previousValues.length) {
    throw new Error('previous deploy reference must be complete');
  }
  if (previousPresent) {
    if (!ALLOWED_API_PORTS.has(state.previousPort) || state.previousPort === state.activePort) {
      throw new Error('previous deploy port must be the inactive 3001 or 3002 port');
    }
    assertReleaseSha(state.previousGitSha);
    assertAbsoluteReleasePath(state.previousRelease, 'previousRelease');
  }

  const stableValues = [state.knownStableGitSha, state.knownStableRelease];
  const stablePresent = stableValues.filter((value) => value !== null && value !== undefined).length;
  if (stablePresent !== 0 && stablePresent !== stableValues.length) {
    throw new Error('known-stable deploy reference must be complete');
  }
  if (stablePresent) {
    assertReleaseSha(state.knownStableGitSha);
    assertAbsoluteReleasePath(state.knownStableRelease, 'knownStableRelease');
  }
  return state;
}

export function nextDeployState(current, candidate) {
  const candidatePort = Number(candidate.candidatePort);
  if (!ALLOWED_API_PORTS.has(candidatePort)) throw new Error('candidate port must be 3001 or 3002');
  if (current) {
    validateDeployState(current);
    if (current.activePort === candidatePort) throw new Error('candidate must use the inactive port');
  }
  assertReleaseSha(candidate.candidateGitSha);
  assertAbsoluteReleasePath(candidate.candidateRelease, 'candidateRelease');
  return {
    schemaVersion: 1,
    activePort: candidatePort,
    activeGitSha: candidate.candidateGitSha,
    activeRelease: candidate.candidateRelease,
    previousPort: current?.activePort ?? null,
    previousGitSha: current?.activeGitSha ?? null,
    previousRelease: current?.activeRelease ?? null,
    knownStableGitSha: current?.knownStableGitSha ?? current?.activeGitSha ?? null,
    knownStableRelease: current?.knownStableRelease ?? current?.activeRelease ?? null,
    switchedAt: candidate.now ?? new Date().toISOString(),
  };
}

export async function writeDeployStateAtomic(stateFile, state) {
  validateDeployState(state);
  const tempFile = `${stateFile}.tmp-${process.pid}`;
  await writeFile(tempFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(tempFile, stateFile);
}

async function writeTextAtomic(path, content) {
  if (content === null) {
    await rm(path, { force: true });
    return;
  }
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, content, { mode: 0o600 });
  await rename(temp, path);
}

async function writeActiveReleaseAtomic(outputFile, releasePath, port) {
  await writeTextAtomic(outputFile, renderActiveRelease(releasePath, port));
}

async function replaceSymlinkAtomic(linkPath, target) {
  const temp = `${linkPath}.tmp-${process.pid}`;
  await rm(temp, { force: true, recursive: true });
  await symlink(target, temp, 'dir');
  if (process.platform === 'win32') await rm(linkPath, { force: true, recursive: true });
  await rename(temp, linkPath);
}

async function restoreLink(linkPath, target) {
  if (target === null) await rm(linkPath, { force: true, recursive: true });
  else await replaceSymlinkAtomic(linkPath, target);
}

async function readOptionalFile(path) {
  return readFile(path, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
}

async function readOptionalLink(path) {
  return readlink(path).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
}

export async function readDeployState(releaseRoot) {
  if (!isAbsolute(releaseRoot)) throw new Error('release root must be absolute');
  const raw = await readOptionalFile(join(releaseRoot, 'deploy-state.json'));
  return raw === null ? null : validateDeployState(JSON.parse(raw));
}

export async function assertSwitchCandidateArtifact({ candidateRelease, candidateGitSha, expectedTarget }) {
  assertWebReleaseTarget(expectedTarget);
  return readAndAssertArtifactManifest(candidateRelease, candidateGitSha, expectedTarget);
}

export function assertRoutingState(current, snapshot, releaseRoot) {
  if (!current) {
    if (snapshot.currentRelease !== null || snapshot.previousRelease !== null) {
      throw new Error('deploy state is missing while current or previous routing links already exist');
    }
    return;
  }
  const expectedActive = resolve(releaseRoot, 'releases', current.activeGitSha);
  if (resolve(current.activeRelease) !== expectedActive) {
    throw new Error('active release is outside releases/<40-character-git-sha>');
  }
  if (snapshot.currentRelease !== expectedActive) throw new Error('current symlink does not match deploy-state.json');
  if (snapshot.activeInclude !== renderActiveRelease(current.activeRelease, current.activePort)) {
    throw new Error('active Nginx include does not match deploy-state.json');
  }
  if (current.previousRelease) {
    const expectedPrevious = resolve(releaseRoot, 'releases', current.previousGitSha);
    if (resolve(current.previousRelease) !== expectedPrevious || snapshot.previousRelease !== expectedPrevious) {
      throw new Error('previous symlink does not match deploy-state.json');
    }
  } else if (snapshot.previousRelease !== null) {
    throw new Error('previous symlink exists without a previous deploy state');
  }
}

export function selectReleasesToPrune(releases, protectedPaths, retainCount = 3) {
  const safeReleases = releases
    .filter((entry) => RELEASE_NAME.test(basename(entry.path)))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  const keep = new Set([...protectedPaths].map((path) => resolve(path)));
  for (const entry of safeReleases) {
    if (keep.size >= retainCount) break;
    keep.add(resolve(entry.path));
  }
  return safeReleases.filter((entry) => !keep.has(resolve(entry.path))).map((entry) => entry.path);
}

export async function withReleaseLock(releaseRoot, task) {
  if (!isAbsolute(releaseRoot)) throw new Error('release root must be absolute');
  const lockFile = join(releaseRoot, 'deploy.lock');
  let handle;
  try {
    handle = await open(lockFile, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('another release switch is already running');
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`);
    return await task();
  } finally {
    await handle.close();
    await rm(lockFile, { force: true });
  }
}

export async function executeReleaseSwitch(candidate, operations) {
  const current = await operations.readState();
  const next = nextDeployState(current, candidate);
  const snapshot = await operations.captureRouting(current);
  let candidateStarted = false;
  let trafficStaged = false;
  let reloadAttempted = false;
  let workerChanged = false;

  try {
    candidateStarted = true;
    await operations.startCandidate(candidate, current);
    await operations.smokeCandidate(candidate);
    trafficStaged = true;
    await operations.stageTraffic(candidate, snapshot);
    await operations.validateNginx();
    reloadAttempted = true;
    await operations.reloadNginx();
    await operations.smokePublic(candidate);
    workerChanged = true;
    await operations.restartWorker(candidate);
    await operations.smokeWorker(candidate);
    await operations.updateLinks(candidate, snapshot.currentRelease ?? null);
    await operations.commitState(next);
  } catch (error) {
    const restorationErrors = [];
    if (trafficStaged) {
      try {
        await operations.restoreTraffic(snapshot);
        if (reloadAttempted) await operations.reloadNginx();
      } catch (rollbackError) {
        restorationErrors.push(`traffic rollback failed: ${rollbackError.message}`);
      }
    }
    if (workerChanged) {
      try {
        await operations.restoreWorker(current);
      } catch (rollbackError) {
        restorationErrors.push(`worker rollback failed: ${rollbackError.message}`);
      }
    }
    if (candidateStarted) {
      try {
        await operations.cleanupCandidate(candidate);
      } catch {
        // The inactive candidate remains out of traffic and can be cleaned up manually.
      }
    }
    if (restorationErrors.length) {
      throw new Error(`release switch failed: ${error.message}; ${restorationErrors.join('; ')}`, { cause: error });
    }
    throw error;
  }

  try {
    if (current) await operations.stopOldApi(current);
  } catch (error) {
    throw new Error(`release committed but old API cleanup failed: ${error.message}`, { cause: error });
  }

  await operations.pruneReleases(next);
  return { status: 'ok', state: next };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.env },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0 || options.allowFailure) resolveRun({ code, stdout, stderr });
      else reject(new Error(`${basename(command)} failed with exit code ${code}: ${stderr.trim().slice(0, 1_000)}`));
    });
  });
}

function assertReleaseLayout(options) {
  for (const [label, path] of Object.entries({
    releaseRoot: options.releaseRoot,
    nodeBin: options.nodeBin,
    pm2Bin: options.pm2Bin,
    nginxBin: options.nginxBin,
    nginxConf: options.nginxConf,
  })) {
    if (!path || !isAbsolute(path)) throw new Error(`${label} must be an absolute path`);
  }
  const expectedRelease = resolve(options.releaseRoot, 'releases', options.candidateGitSha);
  if (resolve(options.candidateRelease) !== expectedRelease) {
    throw new Error('candidate release must be releases/<40-character-git-sha> under the release root');
  }
  if (options.hostname !== 'farm.qingyouai.com') throw new Error('release hostname must be farm.qingyouai.com');
  assertWebReleaseTarget(options.expectedTarget);
}

export function createProductionOperations(options, dependencies = {}) {
  assertReleaseLayout(options);
  const executeCommand = dependencies.runCommand ?? runCommand;
  const smoke = dependencies.runSmoke ?? runSmoke;
  const stateFile = join(options.releaseRoot, 'deploy-state.json');
  const currentLink = join(options.releaseRoot, 'current');
  const previousLink = join(options.releaseRoot, 'previous');
  const activeInclude = join(options.releaseRoot, 'shared', 'active-release.conf');
  const ecosystem = join(options.candidateRelease, 'ops', 'pm2', 'ecosystem.config.cjs');
  const candidateName = releaseProcessName(options.candidatePort);
  const processEnv = {
    NONGCHANG_RELEASE_DIR: options.candidateRelease,
    NONGCHANG_NODE_BIN: options.nodeBin,
    DEPLOYED_GIT_SHA: options.candidateGitSha,
  };
  const nginx = (args) => executeCommand(options.nginxBin, [...args, '-c', options.nginxConf]);

  return {
    readState: () => readDeployState(options.releaseRoot),
    captureRouting: async (current) => {
      const currentLinkTarget = await readOptionalLink(currentLink);
      const previousLinkTarget = await readOptionalLink(previousLink);
      const snapshot = {
        activeInclude: await readOptionalFile(activeInclude),
        currentLinkTarget,
        previousLinkTarget,
        currentRelease: currentLinkTarget === null ? null : resolve(dirname(currentLink), currentLinkTarget),
        previousRelease: previousLinkTarget === null ? null : resolve(dirname(previousLink), previousLinkTarget),
      };
      assertRoutingState(current, snapshot, options.releaseRoot);
      return snapshot;
    },
    startCandidate: async () => {
      await assertSwitchCandidateArtifact(options);
      for (const required of [
        options.candidateRelease,
        join(options.candidateRelease, 'backend', 'src', 'main.js'),
        join(options.candidateRelease, 'web', 'index.html'),
        ecosystem,
      ]) {
        if (!(await stat(required).catch(() => null))) throw new Error(`candidate release input is missing: ${required}`);
      }
      const nodeVersion = await executeCommand(options.nodeBin, ['--version']);
      assertNode20Version(nodeVersion.stdout);
      await mkdir(join(options.releaseRoot, 'shared', 'logs'), { recursive: true, mode: 0o750 });
      await executeCommand(options.pm2Bin, ['delete', candidateName], { allowFailure: true });
      await executeCommand(options.pm2Bin, ['start', ecosystem, '--only', candidateName, '--update-env'], { env: processEnv });
    },
    smokeCandidate: () => smoke({
      baseUrl: `http://127.0.0.1:${options.candidatePort}`,
      expectedSha: options.candidateGitSha,
      traceCode: options.traceCode,
      accessToken: options.accessToken,
    }),
    stageTraffic: async () => {
      await mkdir(dirname(activeInclude), { recursive: true });
      await writeActiveReleaseAtomic(activeInclude, options.candidateRelease, options.candidatePort);
    },
    validateNginx: () => nginx(['-t']),
    reloadNginx: () => nginx(['-s', 'reload']),
    smokePublic: () => smoke({
      baseUrl: `https://${options.hostname}`,
      expectedSha: options.candidateGitSha,
      traceCode: options.traceCode,
      accessToken: options.accessToken,
    }),
    restoreTraffic: async (snapshot) => {
      await writeTextAtomic(activeInclude, snapshot.activeInclude);
      await restoreLink(currentLink, snapshot.currentLinkTarget);
      await restoreLink(previousLink, snapshot.previousLinkTarget);
    },
    updateLinks: async (_candidate, oldRelease) => {
      if (oldRelease) await replaceSymlinkAtomic(previousLink, oldRelease);
      else await rm(previousLink, { force: true, recursive: true });
      await replaceSymlinkAtomic(currentLink, options.candidateRelease);
    },
    commitState: (state) => writeDeployStateAtomic(stateFile, state),
    stopOldApi: (state) => executeCommand(options.pm2Bin, ['stop', releaseProcessName(state.activePort)]),
    restartWorker: () => executeCommand(
      options.pm2Bin,
      ['startOrRestart', ecosystem, '--only', 'nongchang-worker', '--update-env'],
      { env: processEnv },
    ),
    smokeWorker: () => smoke({
      baseUrl: 'http://127.0.0.1:3003',
      expectedSha: options.candidateGitSha,
    }),
    restoreWorker: async (state) => {
      if (!state) {
        await executeCommand(options.pm2Bin, ['delete', 'nongchang-worker'], { allowFailure: true });
        return;
      }
      const oldEcosystem = join(state.activeRelease, 'ops', 'pm2', 'ecosystem.config.cjs');
      const oldEnv = {
        NONGCHANG_RELEASE_DIR: state.activeRelease,
        NONGCHANG_NODE_BIN: options.nodeBin,
        DEPLOYED_GIT_SHA: state.activeGitSha,
      };
      await executeCommand(
        options.pm2Bin,
        ['startOrRestart', oldEcosystem, '--only', 'nongchang-worker', '--update-env'],
        { env: oldEnv },
      );
      await smoke({ baseUrl: 'http://127.0.0.1:3003', expectedSha: state.activeGitSha });
    },
    pruneReleases: async (state) => {
      const releasesDir = join(options.releaseRoot, 'releases');
      const entries = await readdir(releasesDir, { withFileTypes: true });
      const releases = await Promise.all(entries
        .filter((entry) => entry.isDirectory() && RELEASE_NAME.test(entry.name))
        .map(async (entry) => {
          const path = join(releasesDir, entry.name);
          return { path, mtimeMs: (await lstat(path)).mtimeMs };
        }));
      const protectedPaths = new Set([
        state.activeRelease,
        state.previousRelease,
        state.knownStableRelease,
      ].filter(Boolean));
      for (const path of selectReleasesToPrune(releases, protectedPaths)) {
        await rm(path, { recursive: true, force: true });
      }
    },
    cleanupCandidate: () => executeCommand(options.pm2Bin, ['delete', candidateName], { allowFailure: true }),
  };
}

export function parseSwitchArgs(argv, env = process.env) {
  const options = { hostname: 'farm.qingyouai.com' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') continue;
    const key = argv[index];
    const value = argv[++index];
    if (key === '--release-root') options.releaseRoot = resolve(value);
    else if (key === '--candidate-port') options.candidatePort = Number(value);
    else if (key === '--candidate-sha') options.candidateGitSha = value;
    else if (key === '--node-bin') options.nodeBin = resolve(value);
    else if (key === '--pm2-bin') options.pm2Bin = resolve(value);
    else if (key === '--nginx-bin') options.nginxBin = resolve(value);
    else if (key === '--nginx-conf') options.nginxConf = resolve(value);
    else if (key === '--hostname') options.hostname = value;
    else if (key === '--trace-code') options.traceCode = value;
    else if (key === '--expected-target') options.expectedTarget = value;
    else throw new Error(`unknown release switch argument: ${key}`);
  }
  for (const name of ['releaseRoot', 'candidateGitSha', 'candidatePort', 'nodeBin', 'pm2Bin', 'nginxBin', 'nginxConf', 'expectedTarget']) {
    if (!options[name]) throw new Error(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
  }
  assertReleaseSha(options.candidateGitSha);
  options.candidateRelease = join(options.releaseRoot, 'releases', options.candidateGitSha);
  options.expectedTarget = assertWebReleaseTarget(options.expectedTarget);
  options.accessToken = env.NONGCHANG_SMOKE_ACCESS_TOKEN;
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseSwitchArgs(process.argv.slice(2));
  withReleaseLock(options.releaseRoot, () => executeReleaseSwitch(options, createProductionOperations(options)))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`release switch failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}
