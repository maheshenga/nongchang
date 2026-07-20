import { readdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

const DEFAULT_URL = 'postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public';
process.env.DATABASE_URL ||= DEFAULT_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const CONNECT_TIMEOUT_MS = 2_000;
const REQUIRED_USERS = ['sysadmin', 'agentA', 'merchantA', 'merchantB'];
const REQUIRED_TRACE_CODE = 'ORC-DEMO0001';

function parseDatabaseUrl(raw: string): URL {
  try {
    return new URL(raw);
  } catch {
    console.error(`[e2e precheck] DATABASE_URL is not a valid URL: ${raw}`);
    process.exit(1);
  }
}

function checkPort(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once('connect', () => {
      cleanup();
      resolve();
    });
    socket.once('timeout', () => {
      cleanup();
      reject(new Error(`connection timed out after ${CONNECT_TIMEOUT_MS}ms`));
    });
    socket.once('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

function setupCommands(): string[] {
  return [
    'Start the local database and Redis before running e2e tests:',
    '  docker compose -f docker-compose.dev.yml up -d db redis',
    'Then run migrations and seed data if needed:',
    '  pnpm --filter @nongchang/backend prisma:deploy',
    '  pnpm --filter @nongchang/backend prisma:seed',
  ];
}

function fail(lines: string[]): never {
  console.error(lines.join('\n'));
  process.exit(1);
}

function isPrismaSchemaError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2021', 'P2022'].includes(err.code)
  );
}

async function localMigrationNames(): Promise<string[]> {
  const candidates = [
    path.join(process.cwd(), 'prisma', 'migrations'),
    path.join(process.cwd(), 'packages', 'backend', 'prisma', 'migrations'),
  ];

  for (const migrationDir of candidates) {
    try {
      const entries = await readdir(migrationDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  fail([
    '[e2e precheck] Cannot find local Prisma migrations directory.',
    'Run this command from the repository root or backend package directory.',
  ]);
}

async function checkPrismaConnection(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    fail([
      '[e2e precheck] PostgreSQL is reachable, but Prisma cannot connect successfully.',
      `Reason: ${reason}`,
      ...setupCommands(),
    ]);
  }
}

async function checkPostgis(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'postgis'
    ) AS "exists"
  `;

  if (!rows[0]?.exists) {
    fail([
      '[e2e precheck] PostGIS extension is not installed in the target database.',
      'Run migrations against the PostGIS database before e2e tests:',
      '  pnpm --filter @nongchang/backend prisma:deploy',
    ]);
  }
}

async function checkMigrations(prisma: PrismaClient): Promise<void> {
  const tableRows = await prisma.$queryRaw<Array<{ name: string | null }>>`
    SELECT to_regclass('public._prisma_migrations')::text AS "name"
  `;
  if (!tableRows[0]?.name) {
    fail([
      '[e2e precheck] Prisma migrations have not been applied: _prisma_migrations is missing.',
      'Apply migrations before e2e tests:',
      '  pnpm --filter @nongchang/backend prisma:deploy',
    ]);
  }

  const migrationRows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name
  `;
  if (!migrationRows.length) {
    fail([
      '[e2e precheck] Prisma migrations table exists, but no completed migration was found.',
      'Apply migrations before e2e tests:',
      '  pnpm --filter @nongchang/backend prisma:deploy',
    ]);
  }

  const completed = new Set(migrationRows.map((row) => row.migration_name));
  const missing = (await localMigrationNames()).filter((name) => !completed.has(name));
  if (missing.length) {
    fail([
      '[e2e precheck] Database has pending Prisma migrations:',
      ...missing.map((name) => `  - ${name}`),
      'Apply migrations before e2e tests:',
      '  pnpm --filter @nongchang/backend prisma:deploy',
    ]);
  }
}

async function checkSeedData(prisma: PrismaClient): Promise<void> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { code: 'DEMO' },
      select: { id: true },
    });
    if (!tenant) {
      fail([
        '[e2e precheck] Seed tenant DEMO is missing.',
        'Load seed data before e2e tests:',
        '  pnpm --filter @nongchang/backend prisma:seed',
      ]);
    }

    const users = await prisma.user.findMany({
      where: { tenantId: tenant.id, username: { in: REQUIRED_USERS } },
      select: { username: true },
    });
    const foundUsers = new Set(users.map((user) => user.username));
    const missingUsers = REQUIRED_USERS.filter((username) => !foundUsers.has(username));
    if (missingUsers.length) {
      fail([
        `[e2e precheck] Seed users are missing: ${missingUsers.join(', ')}.`,
        'Load seed data before e2e tests:',
        '  pnpm --filter @nongchang/backend prisma:seed',
      ]);
    }

    const traceCode = await prisma.traceCode.findUnique({
      where: { code: REQUIRED_TRACE_CODE },
      select: { tenantId: true, batchId: true, status: true },
    });
    if (!traceCode || traceCode.tenantId !== tenant.id || traceCode.status !== 'active') {
      fail([
        `[e2e precheck] Seed trace code ${REQUIRED_TRACE_CODE} is missing or not active.`,
        'Load seed data before e2e tests:',
        '  pnpm --filter @nongchang/backend prisma:seed',
      ]);
    }

    const traceEvents = await prisma.traceEvent.count({ where: { batchId: traceCode.batchId } });
    if (traceEvents < 7) {
      fail([
        `[e2e precheck] Seed trace chain for ${REQUIRED_TRACE_CODE} is incomplete.`,
        'Load seed data before e2e tests:',
        '  pnpm --filter @nongchang/backend prisma:seed',
      ]);
    }
  } catch (err) {
    if (isPrismaSchemaError(err)) {
      fail([
        '[e2e precheck] Database schema is not ready for e2e tests.',
        'Apply migrations before e2e tests:',
        '  pnpm --filter @nongchang/backend prisma:deploy',
      ]);
    }
    throw err;
  }
}

async function main() {
  const url = parseDatabaseUrl(DATABASE_URL);
  const host = url.hostname;
  const port = Number(url.port || 5432);

  try {
    await checkPort(host, port);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    fail([
      `[e2e precheck] Cannot reach PostgreSQL/PostGIS at ${host}:${port}.`,
      `Reason: ${reason}`,
      ...setupCommands(),
    ]);
  }

  const prisma = new PrismaClient();
  try {
    await checkPrismaConnection(prisma);
    await checkPostgis(prisma);
    await checkMigrations(prisma);
    await checkSeedData(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
