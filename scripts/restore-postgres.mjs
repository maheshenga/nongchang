import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptFile, parseEncryptionKey, sha256File } from './lib/backup-format.mjs';
import { runPostgresToolFromFile } from './lib/postgres-tools.mjs';

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--') continue;
    if (argv[i] === '--backup') options.backup = argv[++i];
    else if (argv[i] === '--database') options.database = argv[++i];
    else throw new Error(`unknown restore argument: ${argv[i]}`);
  }
  if (!options.backup || !isAbsolute(options.backup)) throw new Error('--backup must be an absolute .dump.enc path');
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(options.database ?? '')) throw new Error('--database is invalid');
  return { backup: resolve(options.backup), database: options.database };
}

export async function restoreBackup(options) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const key = parseEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
  const parsed = parseArgs(['--backup', options.backup, '--database', options.database]);
  const checksumPath = join(dirname(parsed.backup), basename(parsed.backup).replace(/\.dump\.enc$/, '.sha256'));
  const checksumLine = await readFile(checksumPath, 'utf8');
  const expected = checksumLine.trim().split(/\s+/)[0];
  const actual = await sha256File(parsed.backup);
  if (!/^[0-9a-f]{64}$/.test(expected) || actual !== expected) throw new Error('backup checksum mismatch');

  const tempDir = await mkdtemp(join(tmpdir(), 'nongchang-restore-'));
  const rawDump = join(tempDir, 'restore.dump');
  try {
    await decryptFile(parsed.backup, rawDump, key);
    await runPostgresToolFromFile('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl'], rawDump, {
      databaseUrl,
      databaseName: parsed.database,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  restoreBackup(options).then(() => {
    process.stdout.write(`restored ${options.database}\n`);
  }).catch((error) => {
    process.stderr.write(`restore failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
