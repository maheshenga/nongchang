import { readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertReleaseSha } from './server-preflight.mjs';

const ALLOWED_API_PORTS = new Set([3001, 3002]);

function assertReleasePath(value, label) {
  if (typeof value !== 'string' || !/^(?:\/|[A-Za-z]:[\\/])/.test(value)) {
    throw new Error(`${label} must be an absolute release path`);
  }
}

export function validateDeployState(state) {
  if (!state || state.schemaVersion !== 1) throw new Error('deploy state schemaVersion must be 1');
  if (!ALLOWED_API_PORTS.has(state.activePort)) throw new Error('deploy state activePort must be 3001 or 3002');
  assertReleaseSha(state.activeGitSha);
  assertReleasePath(state.activeRelease, 'activeRelease');
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
    assertReleasePath(state.previousRelease, 'previousRelease');
  }
  const stableValues = [state.knownStableGitSha, state.knownStableRelease];
  const stablePresent = stableValues.filter((value) => value !== null && value !== undefined).length;
  if (stablePresent !== 0 && stablePresent !== stableValues.length) {
    throw new Error('known-stable deploy reference must be complete');
  }
  if (stablePresent) {
    assertReleaseSha(state.knownStableGitSha);
    assertReleasePath(state.knownStableRelease, 'knownStableRelease');
  }
  return state;
}

export function nextDeployState(current, candidate) {
  if (!ALLOWED_API_PORTS.has(Number(candidate.candidatePort))) throw new Error('candidate port must be 3001 or 3002');
  if (current) {
    validateDeployState(current);
    if (current.activePort === Number(candidate.candidatePort)) throw new Error('candidate must use the inactive port');
  }
  assertReleaseSha(candidate.candidateGitSha);
  assertReleasePath(candidate.candidateRelease, 'candidateRelease');
  return {
    schemaVersion: 1,
    activePort: Number(candidate.candidatePort),
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

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') continue;
    const key = argv[index];
    const value = argv[++index];
    if (key === '--state-file') options.stateFile = resolve(value);
    else if (key === '--candidate-port') options.candidatePort = Number(value);
    else if (key === '--candidate-sha') options.candidateGitSha = value;
    else if (key === '--candidate-release') options.candidateRelease = value;
    else throw new Error(`unknown deploy state argument: ${key}`);
  }
  if (!options.stateFile || basename(options.stateFile) !== 'deploy-state.json') throw new Error('--state-file must end in deploy-state.json');
  return options;
}

async function updateState(options) {
  const current = await readFile(options.stateFile, 'utf8').then(JSON.parse).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const next = nextDeployState(current, options);
  await writeDeployStateAtomic(options.stateFile, next);
  return next;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  updateState(parseArgs(process.argv.slice(2)))
    .then((state) => process.stdout.write(`${JSON.stringify(state)}\n`))
    .catch((error) => {
      process.stderr.write(`deploy state update failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}
