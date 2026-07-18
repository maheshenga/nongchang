import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  encryptFile,
  parseEncryptionKey,
  selectBackupSetsForRetention,
  sha256File,
} from './lib/backup-format.mjs';
import { databaseNameFromUrl, runPostgresToolToFile } from './lib/postgres-tools.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const options = { retention: 14 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--') continue;
    if (argv[i] === '--output-dir') options.outputDir = argv[++i];
    else if (argv[i] === '--retention') options.retention = Number(argv[++i]);
    else throw new Error(`unknown backup argument: ${argv[i]}`);
  }
  if (!options.outputDir || !isAbsolute(options.outputDir)) throw new Error('--output-dir must be an absolute path');
  if (!Number.isInteger(options.retention) || options.retention < 1 || options.retention > 365) {
    throw new Error('--retention must be an integer between 1 and 365');
  }
  const outputDir = resolve(options.outputDir);
  const repoRelative = relative(REPO_ROOT, outputDir);
  if (repoRelative === '' || (!repoRelative.startsWith('..') && !isAbsolute(repoRelative))) {
    throw new Error('backup output directory must be outside the repository');
  }
  return { ...options, outputDir };
}

function timestamp(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function commandVersion(command, args) {
  return new Promise((resolveVersion) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let value = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { value += chunk; });
    child.once('error', () => resolveVersion('unavailable'));
    child.once('close', (code) => resolveVersion(code === 0 ? value.trim().slice(0, 200) : 'unavailable'));
  });
}

async function gitSha() {
  return commandVersion('git', ['rev-parse', 'HEAD']);
}

async function atomicWrite(path, value) {
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, value, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await rename(temp, path);
}

async function discoverBackupSets(outputDir) {
  const files = await readdir(outputDir);
  return files
    .filter((name) => /^\d{8}T\d{6}Z\.manifest\.json$/.test(name))
    .map((manifest) => {
      const timestampValue = manifest.slice(0, 16);
      return {
        timestamp: timestampValue,
        files: [`${timestampValue}.dump.enc`, manifest, `${timestampValue}.sha256`].map((name) => join(outputDir, name)),
      };
    });
}

async function enforceRetention(outputDir, keepCount) {
  const { remove } = selectBackupSetsForRetention(await discoverBackupSets(outputDir), keepCount);
  for (const set of remove) {
    for (const path of set.files) await unlink(path).catch(() => undefined);
  }
}

export async function createBackup(options) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const key = parseEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
  const parsed = parseArgs(['--output-dir', options.outputDir, '--retention', String(options.retention ?? 14)]);
  await mkdir(parsed.outputDir, { recursive: true });
  const tempDir = await mkdtemp(join(tmpdir(), 'nongchang-backup-'));
  const stamp = timestamp(options.now);
  const rawDump = join(tempDir, `${stamp}.dump`);
  const encryptedName = `${stamp}.dump.enc`;
  const encryptedPath = join(parsed.outputDir, encryptedName);
  const manifestPath = join(parsed.outputDir, `${stamp}.manifest.json`);
  const checksumPath = join(parsed.outputDir, `${stamp}.sha256`);
  try {
    await runPostgresToolToFile('pg_dump', ['--format=custom', '--no-owner', '--no-acl'], rawDump, { databaseUrl });
    await encryptFile(rawDump, encryptedPath, key);
    const checksum = await sha256File(encryptedPath);
    const databaseName = databaseNameFromUrl(databaseUrl);
    const pgDumpVersion = process.env.BACKUP_POSTGRES_CONTAINER
      ? await commandVersion('docker', ['exec', process.env.BACKUP_POSTGRES_CONTAINER, 'pg_dump', '--version'])
      : await commandVersion(process.env.PG_BIN_DIR ? join(process.env.PG_BIN_DIR, 'pg_dump') : 'pg_dump', ['--version']);
    const manifest = {
      schemaVersion: 1,
      databaseName,
      gitSha: await gitSha(),
      createdAt: options.now?.toISOString() ?? new Date().toISOString(),
      encryptedFile: encryptedName,
      sha256: checksum,
      tools: { node: process.version, pgDump: pgDumpVersion },
    };
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await atomicWrite(checksumPath, `${checksum}  ${encryptedName}\n`);
    await enforceRetention(parsed.outputDir, parsed.retention);
    return { encryptedPath, manifestPath, checksumPath, manifest };
  } catch (error) {
    await Promise.all([encryptedPath, manifestPath, checksumPath].map((path) => unlink(path).catch(() => undefined)));
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createBackup(parseArgs(process.argv.slice(2))).then((result) => {
    process.stdout.write(`${result.manifestPath}\n`);
  }).catch((error) => {
    process.stderr.write(`backup failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
