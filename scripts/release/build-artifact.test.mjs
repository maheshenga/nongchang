import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import * as artifactModule from './build-artifact.mjs';
import {
  assertCleanWorktree,
  assertLinuxArtifactHost,
  assertRequiredArtifactEntries,
  requiredArtifactEntries,
  verifyArtifactManifest,
} from './build-artifact.mjs';

test('generated Prisma client is located next to the resolved @prisma/client package in pnpm installs', () => {
  assert.equal(typeof artifactModule.generatedPrismaClientDirectory, 'function');
  const clientPackage = resolve(
    'node_modules/.pnpm/@prisma+client@6.19.0/node_modules/@prisma/client/package.json',
  );
  assert.equal(
    artifactModule.generatedPrismaClientDirectory(clientPackage),
    resolve(dirname(clientPackage), '../..', '.prisma/client'),
  );
});

test('runtime dependency copy dereferences temporary pnpm-style links', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-artifact-links-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  const temporaryPackage = join(root, 'temporary-deployment', 'package');
  const destination = join(root, 'destination');
  await mkdir(source, { recursive: true });
  await mkdir(temporaryPackage, { recursive: true });
  await writeFile(join(temporaryPackage, 'index.js'), 'module.exports = 1;\n');
  await symlink(temporaryPackage, join(source, 'package'), process.platform === 'win32' ? 'junction' : 'dir');

  await artifactModule.copyPortableDependencyTree(source, destination);

  assert.equal(await readFile(join(destination, 'package', 'index.js'), 'utf8'), 'module.exports = 1;\n');
  assert.equal((await lstat(join(destination, 'package'))).isSymbolicLink(), false);
});

test('release artifacts refuse a dirty worktree', () => {
  assert.throws(() => assertCleanWorktree(' M packages/backend/src/main.ts\n'), /clean worktree/i);
  assert.doesNotThrow(() => assertCleanWorktree(''));
});

test('artifact manifest verification rejects Git SHA or hash drift', () => {
  const manifest = {
    schemaVersion: 1,
    gitSha: 'abc123',
    files: { 'backend/app.js': 'a'.repeat(64) },
  };
  assert.throws(() => verifyArtifactManifest(manifest, 'different', manifest.files), /Git SHA/i);
  assert.throws(
    () => verifyArtifactManifest(manifest, 'abc123', { 'backend/app.js': 'b'.repeat(64) }),
    /hash mismatch/i,
  );
  assert.doesNotThrow(() => verifyArtifactManifest(manifest, 'abc123', manifest.files));
});

test('production artifact contract includes every server and miniapp runtime input', () => {
  const required = requiredArtifactEntries();
  for (const path of [
    'backend/src/main.js',
    'web/index.html',
    'miniapp/app.js',
    'shared/index.js',
    'prisma/schema.prisma',
    'packages/backend/package.json',
    'packages/shared/package.json',
    'node_modules/@prisma/client/package.json',
    'node_modules/.prisma/client/schema.prisma',
    'node_modules/prisma/package.json',
    'node_modules/.bin/prisma',
    'ops/pgbouncer/pgbouncer.ini',
    'ops/data-stack/compose.production.yml',
    'ops/pm2/ecosystem.config.cjs',
    'ops/nginx/farm.qingyouai.com.conf.template',
    'ops/logrotate/nongchang',
    'ops/runtime/production.env.example',
    'scripts/release/switch-release.mjs',
    'scripts/release/verify-artifact.mjs',
    'scripts/lib/backup-format.mjs',
    'scripts/backup-postgres.mjs',
  ]) {
    assert.ok(required.includes(path), `missing artifact contract path: ${path}`);
  }
  assert.doesNotThrow(() => assertRequiredArtifactEntries(required));
  assert.throws(
    () => assertRequiredArtifactEntries(required.filter((path) => path !== 'miniapp/app.js')),
    /miniapp\/app\.js/,
  );
});

test('immutable runtime artifacts are built only on Linux x64', () => {
  assert.doesNotThrow(() => assertLinuxArtifactHost('linux', 'x64'));
  assert.throws(() => assertLinuxArtifactHost('win32', 'x64'), /Linux x64/i);
  assert.throws(() => assertLinuxArtifactHost('linux', 'arm64'), /Linux x64/i);
});
