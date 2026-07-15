import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPostgresTool } from '../lib/postgres-tools.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function run(command, args, env = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      windowsHide: true,
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolveRun() : reject(new Error(`${command} failed with exit code ${code}`)));
  });
}

export function resolveMigrationRuntime(root, platform = process.platform, pathExists = existsSync) {
  const paths = platform === 'win32' ? win32 : posix;
  const artifactSchema = paths.join(root, 'prisma', 'schema.prisma');
  return {
    command: paths.join(root, 'node_modules', '.bin', platform === 'win32' ? 'prisma.cmd' : 'prisma'),
    schema: pathExists(artifactSchema)
      ? artifactSchema
      : paths.join(root, 'packages', 'backend', 'prisma', 'schema.prisma'),
  };
}

export async function migrationPreflight() {
  const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DIRECT_DATABASE_URL or DATABASE_URL is required');
  const consistency = await runPostgresTool('psql', [
    '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1',
    '--command', `
      SELECT json_build_object(
        'orphanUsers', (SELECT count(*) FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id WHERE t.id IS NULL),
        'orphanBatches', (SELECT count(*) FROM batches b LEFT JOIN tenants t ON t.id = b.tenant_id WHERE t.id IS NULL),
        'duplicateTraceCodes', (SELECT count(*) FROM (SELECT code FROM trace_codes GROUP BY code HAVING count(*) > 1) d)
      );
    `,
  ], { databaseUrl });
  const report = JSON.parse(consistency.split(/\r?\n/).find((line) => line.trim().startsWith('{')));
  if (Object.values(report).some((value) => Number(value) !== 0)) throw new Error('migration consistency preflight failed');
  const runtime = resolveMigrationRuntime(REPO_ROOT);
  await run(runtime.command, ['migrate', 'status', '--schema', runtime.schema], { DATABASE_URL: databaseUrl });
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrationPreflight().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`migration preflight failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
