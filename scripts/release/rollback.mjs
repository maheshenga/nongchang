import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createProductionOperations,
  executeReleaseSwitch,
  readDeployState,
  validateDeployState,
  withReleaseLock,
} from './switch-release.mjs';
import { assertWebReleaseTarget } from './artifact-contract.mjs';

const FORBIDDEN = /(?:prisma\s+migrate\s+reset|migrate\s+down|reverse\.sql|(?:database[-_ ]rollback|rollback[-_ ]database)|\b(?:drop|alter|truncate)\s+(?:table|database|schema)|\bpsql\b)/i;

export function assertSafeRollbackArgs(args) {
  if (FORBIDDEN.test(args.join(' '))) {
    throw new Error('database rollback commands are forbidden; rollback application artifacts only');
  }
}

export function parseRollbackArgs(argv, env = process.env) {
  assertSafeRollbackArgs(argv);
  const options = { hostname: 'farm.qingyouai.com' };
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
    else if (key === '--expected-target') options.expectedTarget = value;
    else if (key === '--confirm-forward-schema-compatible') options.confirmForwardSchemaCompatible = value;
    else throw new Error(`unknown rollback argument: ${key}`);
  }
  for (const name of ['releaseRoot', 'nodeBin', 'pm2Bin', 'nginxBin', 'nginxConf']) {
    if (!options[name] || !isAbsolute(options[name])) {
      throw new Error(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} must be absolute or present`);
    }
  }
  if (!options.expectedTarget) throw new Error('--expected-target is required');
  if (options.confirmForwardSchemaCompatible !== 'yes') {
    throw new Error('rollback requires explicit forward schema compatibility confirmation');
  }
  options.expectedTarget = assertWebReleaseTarget(options.expectedTarget);
  options.accessToken = env.NONGCHANG_SMOKE_ACCESS_TOKEN;
  return options;
}

export async function rollbackApplication(options, dependencies = {}) {
  const lock = dependencies.withReleaseLock ?? withReleaseLock;
  const loadState = dependencies.readDeployState ?? readDeployState;
  const operationsFactory = dependencies.createProductionOperations ?? createProductionOperations;
  return lock(options.releaseRoot, async () => {
    const current = validateDeployState(await loadState(options.releaseRoot));
    if (!current.previousRelease) throw new Error('deploy state has no previous application release to roll back');
    const expectedPrevious = resolve(options.releaseRoot, 'releases', current.previousGitSha);
    if (resolve(current.previousRelease) !== expectedPrevious) {
      throw new Error('previous application release is outside releases/<40-character-git-sha>');
    }
    const candidate = {
      ...options,
      candidatePort: current.previousPort,
      candidateGitSha: current.previousGitSha,
      candidateRelease: current.previousRelease,
      expectedTarget: assertWebReleaseTarget(options.expectedTarget),
    };
    return executeReleaseSwitch(candidate, operationsFactory(candidate));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseRollbackArgs(process.argv.slice(2));
  rollbackApplication(options)
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`rollback refused: ${error.message}\n`);
      process.exitCode = 1;
    });
}
