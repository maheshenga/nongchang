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

test('buildArtifact defaults its API target to Web', async () => {
  const outputDir = resolve('..', 'nongchang-artifact-output');
  await assert.rejects(
    () => artifactModule.buildArtifact({ outputDir, skipBuild: true }),
    /Linux x64/i,
  );
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
