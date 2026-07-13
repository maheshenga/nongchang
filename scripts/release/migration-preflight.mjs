import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPostgresTool } from '../lib/postgres-tools.mjs';

const COREPACK = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      windowsHide: true,
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolveRun() : reject(new Error(`${command} failed with exit code ${code}`)));
  });
}

export async function migrationPreflight() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
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
  await run(COREPACK, ['pnpm@10.33.2', '--filter', '@nongchang/backend', 'exec', 'prisma', 'migrate', 'status']);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrationPreflight().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`migration preflight failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
