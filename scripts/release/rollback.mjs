import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeployState } from './deploy-state.mjs';
import { assertReleaseSha } from './server-preflight.mjs';
import {
  createProductionOperations,
  executeReleaseSwitch,
  withReleaseLock,
} from './switch-release.mjs';

const FORBIDDEN = /(?:prisma\s+migrate\s+reset|migrate\s+down|reverse\.sql|database[-_ ]rollback|\b(?:drop|alter|truncate)\s+(?:table|database|schema)|\bpsql\b)/i;

export function assertSafeRollbackArgs(args) {
  if (FORBIDDEN.test(args.join(' '))) {
    throw new Error('database rollback commands are forbidden; rollback application artifacts only');
  }
}

export function assertSchemaCompatibilityAcknowledged(value) {
  if (value !== 'yes') {
    throw new Error('forward schema compatibility must be reviewed and acknowledged with yes');
  }
}

function portable(path) {
  return path.replaceAll('\\', '/').replace(/\/$/, '');
}

export function rollbackCandidate(state, releaseRoot) {
  try {
    validateDeployState(state);
  } catch (error) {
    throw new Error(`deploy state is invalid: ${error.message}`);
  }
  if (![3001, 3002].includes(state.previousPort) || state.previousPort === state.activePort) {
    throw new Error('deploy state has no inactive previous API port');
  }
  assertReleaseSha(state.previousGitSha);
  if (!state.previousRelease) throw new Error('deploy state has no previous immutable release');
  const expected = `${portable(releaseRoot)}/releases/${state.previousGitSha}`;
  if (portable(state.previousRelease) !== expected) {
    throw new Error('previous release does not match releases/<40-character-git-sha>');
  }
  return {
    candidatePort: state.previousPort,
    candidateGitSha: state.previousGitSha,
    candidateRelease: state.previousRelease,
  };
}

function parseArgs(argv) {
  assertSafeRollbackArgs(argv);
  const options = { hostname: 'farm.qingyouai.com' };
  let confirmation;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') continue;
    const key = argv[index];
    const value = argv[++index];
    if (key === '--release-root') options.releaseRoot = resolve(value);
    else if (key === '--node-bin') options.nodeBin = resolve(value);
    else if (key === '--pm2-bin') options.pm2Bin = resolve(value);
    else if (key === '--nginx-bin') options.nginxBin = resolve(value);
    else if (key === '--nginx-conf') options.nginxConf = resolve(value);
    else if (key === '--hostname') options.hostname = value;
    else if (key === '--trace-code') options.traceCode = value;
    else if (key === '--confirm-forward-schema-compatible') confirmation = value;
    else throw new Error(`unknown rollback argument: ${key}`);
  }
  assertSchemaCompatibilityAcknowledged(confirmation);
  for (const name of ['releaseRoot', 'nodeBin', 'pm2Bin', 'nginxBin', 'nginxConf']) {
    if (!options[name] || !isAbsolute(options[name])) {
      throw new Error(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} must be absolute`);
    }
  }
  options.accessToken = process.env.NONGCHANG_SMOKE_ACCESS_TOKEN;
  return options;
}

async function runRollback(options) {
  const stateFile = join(options.releaseRoot, 'deploy-state.json');
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  const candidate = rollbackCandidate(state, options.releaseRoot);
  const switchOptions = { ...options, ...candidate };
  return withReleaseLock(options.releaseRoot, () => (
    executeReleaseSwitch(switchOptions, createProductionOperations(switchOptions))
  ));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve()
    .then(() => runRollback(parseArgs(process.argv.slice(2))))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`rollback refused: ${error.message}\n`);
      process.exitCode = 1;
    });
}
