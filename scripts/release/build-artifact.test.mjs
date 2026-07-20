import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import test from 'node:test';
import * as artifactModule from './build-artifact.mjs';
import {
  assertCleanWorktree,
  assertLinuxArtifactHost,
  assertRequiredArtifactEntries,
  artifactSourceEntries,
  createPayloadManifest,
  normalizeBuildArtifactOptions,
  parseArtifactArgs,
  releaseBuildCommands,
  requiredArtifactEntries,
  verifyArtifactManifest,
} from './build-artifact.mjs';

test('artifact arguments require an explicit Web target', () => {
  const outputDir = resolve('..', 'nongchang-artifact-output');
  assert.deepEqual(parseArtifactArgs(['--output-dir', outputDir, '--target', 'web']), {
    outputDir,
    target: 'web',
  });
  assert.throws(() => parseArtifactArgs(['--output-dir', outputDir]), /--target is required/);
  assert.throws(
    () => parseArtifactArgs(['--output-dir', outputDir, '--target', 'miniapp']),
    /release target must be web/,
  );
});

test('buildArtifact defaults its API target to Web without starting a build', () => {
  const outputDir = resolve('..', 'nongchang-artifact-output');
  assert.deepEqual(normalizeBuildArtifactOptions({ outputDir, skipBuild: true }), {
    outputDir,
    target: 'web',
    skipBuild: true,
  });
});

test('backend declares the Prisma CLI as a production dependency for artifact deployment', async () => {
  const backendPackage = JSON.parse(await readFile(
    new URL('../../packages/backend/package.json', import.meta.url),
    'utf8',
  ));
  assert.equal(backendPackage.dependencies.prisma, '^6.19.0');
  assert.equal(backendPackage.devDependencies?.prisma, undefined);
});

test('backend declares the structured tar reader as a production dependency for artifact verification', async () => {
  const backendPackage = JSON.parse(await readFile(
    new URL('../../packages/backend/package.json', import.meta.url),
    'utf8',
  ));
  assert.equal(backendPackage.dependencies.tar, '7.5.20');
  assert.equal(backendPackage.devDependencies?.tar, undefined);
});

test('Web artifact build commands do not build the miniapp', () => {
  assert.deepEqual(releaseBuildCommands('web'), ['build:shared', 'build:backend', 'build:web']);
});

test('Web artifact source entries do not copy the miniapp output', () => {
  const sources = artifactSourceEntries('web');
  assert.ok(sources.some(([target, source]) => target === 'web' && source === 'packages/web/dist'));
  assert.equal(sources.some(([target]) => target === 'miniapp'), false);
});

test('every required Web artifact path has a current source or deploy output mapping', () => {
  assert.equal(typeof artifactModule.requiredArtifactInputMappings, 'function');
  assert.equal(typeof artifactModule.assertRequiredArtifactInputMappings, 'function');
  const mappings = artifactModule.requiredArtifactInputMappings('web');
  assert.deepEqual(
    mappings.map(({ target }) => target).sort(),
    requiredArtifactEntries().sort(),
  );
  assert.doesNotThrow(() => artifactModule.assertRequiredArtifactInputMappings('web'));
});

test('Web artifact payload manifest records schema 2 and target metadata', () => {
  const gitSha = 'a'.repeat(40);
  const files = { 'web/index.html': 'b'.repeat(64) };
  assert.deepEqual(createPayloadManifest(gitSha, 'web', files), {
    schemaVersion: 2,
    target: 'web',
    gitSha,
    provenance: { platform: 'linux', arch: 'x64' },
    files,
  });
});

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

test('runtime dependency copy rewrites temporary pnpm-style links inside the artifact', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-artifact-links-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  const temporaryPackage = join(source, '.pnpm', 'package');
  const destination = join(root, 'destination');
  await mkdir(temporaryPackage, { recursive: true });
  await writeFile(join(temporaryPackage, 'index.js'), 'module.exports = 1;\n');
  await symlink(temporaryPackage, join(source, 'package'), process.platform === 'win32' ? 'junction' : 'dir');

  await artifactModule.copyPortableDependencyTree(source, destination);

  const copiedLink = join(destination, 'package');
  const copiedTarget = await readlink(copiedLink);
  assert.equal((await lstat(copiedLink)).isSymbolicLink(), true);
  assert.equal(isAbsolute(copiedTarget), false);
  assert.equal(resolve(dirname(copiedLink), copiedTarget), join(destination, '.pnpm', 'package'));
  assert.equal(await readFile(join(copiedLink, 'index.js'), 'utf8'), 'module.exports = 1;\n');
});

test('pnpm directory links are physical archive entries with separate internal runtime paths', { skip: process.platform !== 'linux' }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-artifact-prisma-links-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const release = join(root, 'release');
  const source = join(release, 'node_modules');
  const destination = join(root, 'destination');
  const clientStore = join(source, '.pnpm', '@prisma+client', 'node_modules', '@prisma', 'client');
  const prismaStore = join(source, '.pnpm', 'prisma', 'node_modules', 'prisma');
  await mkdir(join(source, '@prisma'), { recursive: true });
  await mkdir(join(source, '.prisma', 'client'), { recursive: true });
  await mkdir(join(prismaStore, 'build'), { recursive: true });
  await mkdir(clientStore, { recursive: true });
  await writeFile(join(clientStore, 'package.json'), '{"name":"@prisma/client"}\n');
  await writeFile(join(prismaStore, 'package.json'), '{"name":"prisma"}\n');
  await writeFile(join(prismaStore, 'build', 'index.js'), 'module.exports = {};\n');
  await writeFile(join(source, '.prisma', 'client', 'schema.prisma'), 'generator client {}\n');
  await mkdir(join(source, '.bin'), { recursive: true });
  await symlink('../.pnpm/@prisma+client/node_modules/@prisma/client', join(source, '@prisma', 'client'), 'dir');
  await symlink('.pnpm/prisma/node_modules/prisma', join(source, 'prisma'), 'dir');
  await symlink('../prisma/build/index.js', join(source, '.bin', 'prisma'));

  const archiveEntries = await artifactModule.listArtifactFiles(source);
  const pnpmLinkEntries = new Set([
    'node_modules/@prisma/client',
    'node_modules/prisma',
    'node_modules/.bin/prisma',
  ]);
  const requiredNonPrismaEntries = requiredArtifactEntries().filter((path) => !pnpmLinkEntries.has(path));
  assert.doesNotThrow(() => assertRequiredArtifactEntries([
    ...requiredNonPrismaEntries,
    ...archiveEntries.map((path) => `node_modules/${path}`),
  ]));
  assert.ok(archiveEntries.includes('@prisma/client'));
  assert.ok(archiveEntries.includes('prisma'));
  assert.equal(archiveEntries.includes('@prisma/client/package.json'), false);
  assert.equal(archiveEntries.includes('prisma/package.json'), false);
  await assert.doesNotReject(() => artifactModule.assertRuntimeArtifactPathsResolveWithinRelease(release));

  await rm(join(source, '.pnpm', '@prisma+client', 'node_modules', '@prisma', 'client', 'package.json'));
  await assert.rejects(
    () => artifactModule.assertRuntimeArtifactPathsResolveWithinRelease(release),
    /runtime path.*@prisma\/client\/package\.json/i,
  );
});

test('artifact enumeration preserves a symbolic link as a physical entry and runtime paths fail closed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-artifact-runtime-paths-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const release = join(root, 'release');
  const linkedFile = join(release, 'linked.js');
  await mkdir(release, { recursive: true });
  await writeFile(join(release, 'target.js'), 'module.exports = 1;\n');
  await symlink('target.js', linkedFile);
  for (const path of [
    'node_modules/@prisma/client/package.json',
    'node_modules/.prisma/client/schema.prisma',
    'node_modules/prisma/package.json',
    'node_modules/.bin/prisma',
  ]) {
    const runtimePath = join(release, path);
    await mkdir(dirname(runtimePath), { recursive: true });
    await writeFile(runtimePath, 'runtime\n');
  }

  const entries = await artifactModule.listArtifactFiles(release);
  assert.ok(entries.includes('linked.js'));
  await assert.doesNotReject(() => artifactModule.assertRuntimeArtifactPathsResolveWithinRelease(release));

  await rm(join(release, 'node_modules', 'prisma', 'package.json'));
  await assert.rejects(
    () => artifactModule.assertRuntimeArtifactPathsResolveWithinRelease(release),
    /runtime path.*prisma\/package\.json/i,
  );
});

test('runtime dependency copy removes only the pnpm backend self-link that escapes the deployment tree', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-artifact-links-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  const workspaceBackend = join(root, 'workspace', 'backend');
  const selfLink = join(source, '.pnpm', 'node_modules', '@nongchang', 'backend');
  const destination = join(root, 'destination');
  await mkdir(dirname(selfLink), { recursive: true });
  await mkdir(workspaceBackend, { recursive: true });
  await symlink(workspaceBackend, selfLink, process.platform === 'win32' ? 'junction' : 'dir');

  await artifactModule.copyPortableDependencyTree(source, destination);

  await assert.rejects(() => lstat(join(destination, '.pnpm', 'node_modules', '@nongchang', 'backend')));
});

test('release artifacts refuse a dirty worktree', () => {
  assert.throws(() => assertCleanWorktree(' M packages/backend/src/main.ts\n'), /clean worktree/i);
  assert.doesNotThrow(() => assertCleanWorktree(''));
});

test('artifact manifest verification rejects Git SHA or hash drift', () => {
  const manifest = {
    schemaVersion: 2,
    target: 'web',
    gitSha: 'a'.repeat(40),
    provenance: { platform: 'linux', arch: 'x64' },
    files: { 'backend/app.js': 'a'.repeat(64) },
  };
  assert.throws(() => verifyArtifactManifest(manifest, 'b'.repeat(40), 'web', manifest.files), /Git SHA/i);
  assert.throws(
    () => verifyArtifactManifest(manifest, manifest.gitSha, 'web', { 'backend/app.js': 'b'.repeat(64) }),
    /hash mismatch/i,
  );
  assert.doesNotThrow(() => verifyArtifactManifest(manifest, manifest.gitSha, 'web', manifest.files));
});

test('artifact manifest verification requires the expected Web target', () => {
  const manifest = {
    schemaVersion: 2,
    target: 'web',
    gitSha: 'a'.repeat(40),
    provenance: { platform: 'linux', arch: 'x64' },
    files: { 'backend/app.js': 'b'.repeat(64) },
  };
  assert.doesNotThrow(() => verifyArtifactManifest(manifest, manifest.gitSha, 'web', manifest.files));
  assert.throws(
    () => verifyArtifactManifest({ ...manifest, target: 'miniapp' }, manifest.gitSha, 'web', manifest.files),
    /target does not match/,
  );
});

test('Web production artifact contract excludes miniapp output', () => {
  const required = requiredArtifactEntries();
  assert.ok(required.length > 0);
  assert.doesNotThrow(() => assertRequiredArtifactEntries(required));
  assert.throws(
    () => assertRequiredArtifactEntries([...required, 'miniapp/app.js']),
    /must not contain miniapp payload/,
  );
});

test('immutable runtime artifacts are built only on Linux x64', () => {
  assert.doesNotThrow(() => assertLinuxArtifactHost('linux', 'x64'));
  assert.throws(() => assertLinuxArtifactHost('win32', 'x64'), /Linux x64/i);
  assert.throws(() => assertLinuxArtifactHost('linux', 'arm64'), /Linux x64/i);
});
