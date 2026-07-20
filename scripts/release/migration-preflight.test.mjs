import assert from 'node:assert/strict';
import { posix, win32 } from 'node:path';
import test from 'node:test';
import { resolveMigrationDatabaseUrl, resolveMigrationRuntime } from './migration-preflight.mjs';

test('migration preflight selects artifact-local Prisma and schema when present', () => {
  const root = '/releases/immutable';
  assert.deepEqual(resolveMigrationRuntime(root, 'linux', (path) => path === posix.join(root, 'prisma', 'schema.prisma')), {
    command: posix.join(root, 'node_modules', '.bin', 'prisma'),
    schema: posix.join(root, 'prisma', 'schema.prisma'),
  });
  assert.deepEqual(resolveMigrationRuntime('C:\\release', 'win32', (path) => path === win32.join('C:\\release', 'prisma', 'schema.prisma')), {
    command: win32.join('C:\\release', 'node_modules', '.bin', 'prisma.cmd'),
    schema: win32.join('C:\\release', 'prisma', 'schema.prisma'),
  });
});

test('migration preflight prefers DIRECT_DATABASE_URL without changing forward-only status behavior', () => {
  assert.equal(resolveMigrationDatabaseUrl({ DIRECT_DATABASE_URL: 'direct', DATABASE_URL: 'pooled' }), 'direct');
  assert.equal(resolveMigrationDatabaseUrl({ DATABASE_URL: 'pooled' }), 'pooled');
  assert.throws(() => resolveMigrationDatabaseUrl({}), /DIRECT_DATABASE_URL or DATABASE_URL/);
});
