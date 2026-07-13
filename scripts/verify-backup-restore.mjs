import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackup } from './backup-postgres.mjs';
import { restoreBackup } from './restore-postgres.mjs';
import { runPostgresTool } from './lib/postgres-tools.mjs';

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--') continue;
    if (argv[i] === '--output-dir') options.outputDir = argv[++i];
    else throw new Error(`unknown restore drill argument: ${argv[i]}`);
  }
  if (!options.outputDir) throw new Error('--output-dir is required');
  return options;
}

export async function verifyBackupRestore(options) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const database = `nongchang_restore_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
  const backup = await createBackup({ outputDir: resolve(options.outputDir), retention: 14 });
  let created = false;
  try {
    await runPostgresTool('createdb', [database], { databaseUrl });
    created = true;
    await restoreBackup({ backup: backup.encryptedPath, database });
    const verification = await runPostgresTool('psql', [
      '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1',
      '--command', `
        SELECT json_build_object(
          'tenants', (SELECT count(*) FROM tenants),
          'users', (SELECT count(*) FROM users),
          'orphanUsers', (SELECT count(*) FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id WHERE t.id IS NULL),
          'orphanBatches', (SELECT count(*) FROM batches b LEFT JOIN tenants t ON t.id = b.tenant_id WHERE t.id IS NULL)
        );
      `,
    ], { databaseUrl, databaseName: database });
    const result = JSON.parse(verification.split(/\r?\n/).find((line) => line.trim().startsWith('{')));
    if (Number(result.orphanUsers) !== 0 || Number(result.orphanBatches) !== 0) {
      throw new Error('restored database failed tenant consistency audit');
    }
    return { database, backup: backup.manifestPath, verification: result };
  } finally {
    if (created) await runPostgresTool('dropdb', ['--if-exists', '--force', database], { databaseUrl }).catch(() => undefined);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyBackupRestore(parseArgs(process.argv.slice(2))).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`backup restore drill failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
