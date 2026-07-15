import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMigrationRuntime } from './migration-preflight.mjs';

test('migration preflight uses the artifact-local Prisma CLI and schema without a registry install', () => {
  const runtime = resolveMigrationRuntime('/srv/farm/releases/abc', 'linux', (path) => (
    path === '/srv/farm/releases/abc/prisma/schema.prisma'
  ));
  assert.deepEqual(runtime, {
    command: '/srv/farm/releases/abc/node_modules/.bin/prisma',
    schema: '/srv/farm/releases/abc/prisma/schema.prisma',
  });
});

test('repository execution falls back to the source Prisma CLI and schema', () => {
  const runtime = resolveMigrationRuntime('C:\\repo', 'win32', () => false);
  assert.deepEqual(runtime, {
    command: 'C:\\repo\\packages\\backend\\node_modules\\.bin\\prisma.cmd',
    schema: 'C:\\repo\\packages\\backend\\prisma\\schema.prisma',
  });
});

test('Linux repository execution uses the workspace Prisma CLI required by release CI', () => {
  const runtime = resolveMigrationRuntime('/home/runner/work/nongchang/nongchang', 'linux', () => false);
  assert.deepEqual(runtime, {
    command: '/home/runner/work/nongchang/nongchang/packages/backend/node_modules/.bin/prisma',
    schema: '/home/runner/work/nongchang/nongchang/packages/backend/prisma/schema.prisma',
  });
});
