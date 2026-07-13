import { readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN = /(?:prisma\s+migrate\s+reset|migrate\s+down|reverse\.sql|database[-_ ]rollback|\b(?:drop|alter|truncate)\s+(?:table|database|schema)|\bpsql\b)/i;

export function assertSafeRollbackArgs(args) {
  if (FORBIDDEN.test(args.join(' '))) {
    throw new Error('database rollback commands are forbidden; rollback application artifacts only');
  }
}

function parseArgs(argv) {
  assertSafeRollbackArgs(argv);
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--') continue;
    if (argv[i] === '--artifact') options.artifact = argv[++i];
    else if (argv[i] === '--manifest') options.manifest = argv[++i];
    else if (argv[i] === '--state-file') options.stateFile = argv[++i];
    else throw new Error(`unknown rollback argument: ${argv[i]}`);
  }
  for (const name of ['artifact', 'manifest', 'stateFile']) {
    if (!options[name] || !isAbsolute(options[name])) throw new Error(`--${name.replace(/[A-Z]/g, (v) => `-${v.toLowerCase()}`)} must be absolute`);
  }
  return Object.fromEntries(Object.entries(options).map(([key, value]) => [key, resolve(value)]));
}

export async function switchApplicationArtifact(options) {
  const parsed = parseArgs([
    '--artifact', options.artifact,
    '--manifest', options.manifest,
    '--state-file', options.stateFile,
  ]);
  const manifest = JSON.parse(await readFile(parsed.manifest, 'utf8'));
  if (basename(parsed.artifact) !== manifest.archive) throw new Error('rollback artifact does not match manifest');
  if (!/^[0-9a-f]{40}$/.test(manifest.gitSha) || !basename(parsed.artifact).includes(manifest.gitSha)) {
    throw new Error('rollback artifact is not immutable by Git SHA');
  }
  const state = {
    schemaVersion: 1,
    deployedGitSha: manifest.gitSha,
    artifact: parsed.artifact,
    manifest: parsed.manifest,
    switchedAt: new Date().toISOString(),
  };
  const temp = `${parsed.stateFile}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, parsed.stateFile);
  return state;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  switchApplicationArtifact(options).then((state) => process.stdout.write(`${JSON.stringify(state)}\n`)).catch((error) => {
    process.stderr.write(`rollback refused: ${error.message}\n`);
    process.exitCode = 1;
  });
}
