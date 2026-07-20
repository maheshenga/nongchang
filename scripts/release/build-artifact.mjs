import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cp, lstat, mkdtemp, mkdir, readlink, readdir, readFile, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARTIFACT_MANIFEST_SCHEMA_VERSION,
  WEB_REQUIRED_ARTIFACT_ENTRIES,
  assertArtifactManifestContract,
  assertReleaseSha,
  assertWebArtifactPayload,
  assertWebReleaseTarget,
} from './artifact-contract.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const COREPACK = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const BACKEND_REQUIRE = createRequire(join(REPO_ROOT, 'packages/backend/package.json'));
const PNPM_BACKEND_SELF_LINK = '.pnpm/node_modules/@nongchang/backend';

export function requiredArtifactEntries() {
  return [...WEB_REQUIRED_ARTIFACT_ENTRIES];
}

export function assertRequiredArtifactEntries(actualEntries) {
  assertWebArtifactPayload(actualEntries);
}

export function assertLinuxArtifactHost(platform, arch) {
  if (platform !== 'linux' || arch !== 'x64') {
    throw new Error('immutable production artifacts must be built on Linux x64');
  }
}

export function generatedPrismaClientDirectory(clientPackageFile) {
  return resolve(dirname(clientPackageFile), '../..', '.prisma/client');
}

export function assertCleanWorktree(statusOutput) {
  if (statusOutput.trim()) throw new Error('release artifact requires a clean worktree');
}

export function releaseBuildCommands(target) {
  assertWebReleaseTarget(target);
  return ['build:shared', 'build:backend', 'build:web'];
}

export function artifactSourceEntries(target) {
  assertWebReleaseTarget(target);
  return [
    ['backend', 'packages/backend/dist'],
    ['web', 'packages/web/dist'],
    ['shared', 'packages/shared/dist'],
    ['prisma/migrations', 'packages/backend/prisma/migrations'],
    ['prisma/schema.prisma', 'packages/backend/prisma/schema.prisma'],
    ['ops', 'ops'],
    ['scripts/release', 'scripts/release'],
    ['scripts/lib', 'scripts/lib'],
    ['scripts/backup-postgres.mjs', 'scripts/backup-postgres.mjs'],
    ['scripts/restore-postgres.mjs', 'scripts/restore-postgres.mjs'],
    ['scripts/verify-backup-restore.mjs', 'scripts/verify-backup-restore.mjs'],
  ];
}

export function verifyArtifactManifest(manifest, expectedGitSha, expectedTarget, actualFiles) {
  assertArtifactManifestContract(manifest, expectedGitSha, expectedTarget);
  for (const [path, expectedHash] of Object.entries(manifest.files ?? {})) {
    if (actualFiles[path] !== expectedHash) throw new Error(`artifact hash mismatch: ${path}`);
  }
  if (Object.keys(actualFiles).length !== Object.keys(manifest.files ?? {}).length) {
    throw new Error('artifact manifest file set mismatch');
  }
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: { ...process.env, ...options.env },
      windowsHide: true,
      shell: options.shell ?? false,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (options.capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolveRun(stdout.trim());
      else reject(new Error(`${command} failed with exit code ${code}${stderr ? `: ${stderr.trim().slice(0, 2_000)}` : ''}`));
    });
  });
}

async function sha256File(path) {
  const hash = createHash('sha256');
  const info = await lstat(path);
  if (info.isSymbolicLink()) hash.update(`symlink:${await readlink(path)}`);
  else hash.update(await readFile(path));
  return hash.digest('hex');
}

export function createPayloadManifest(gitSha, target, files) {
  const manifest = {
    schemaVersion: ARTIFACT_MANIFEST_SCHEMA_VERSION,
    target: assertWebReleaseTarget(target),
    gitSha,
    files,
  };
  verifyArtifactManifest(manifest, gitSha, target, files);
  return manifest;
}

function isPathWithin(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot));
}

async function rebaseDependencySymlinks(sourceRoot, destinationRoot, current = sourceRoot) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const sourcePath = join(current, entry.name);
    if (entry.isDirectory()) {
      await rebaseDependencySymlinks(sourceRoot, destinationRoot, sourcePath);
      continue;
    }
    if (!entry.isSymbolicLink()) continue;

    const target = await readlink(sourcePath);
    const resolvedTarget = resolve(dirname(sourcePath), target);
    const relativeSourcePath = relative(sourceRoot, sourcePath).split(sep).join('/');
    const destinationPath = join(destinationRoot, relative(sourceRoot, sourcePath));
    if (!isPathWithin(sourceRoot, resolvedTarget)) {
      if (relativeSourcePath === PNPM_BACKEND_SELF_LINK) {
        await unlink(destinationPath);
        continue;
      }
      throw new Error(`dependency symlink escapes the deployment tree: ${relativeSourcePath}`);
    }

    const destinationTarget = join(destinationRoot, relative(sourceRoot, resolvedTarget));
    const portableTarget = relative(dirname(destinationPath), destinationTarget) || '.';
    await unlink(destinationPath);
    await symlink(portableTarget, destinationPath, (await stat(sourcePath)).isDirectory() ? 'dir' : 'file');
  }
}

export async function copyPortableDependencyTree(source, destination) {
  const sourceRoot = resolve(source);
  const destinationRoot = resolve(destination);
  await cp(sourceRoot, destinationRoot, { recursive: true });
  await rebaseDependencySymlinks(sourceRoot, destinationRoot);
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, path));
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(relative(root, path).split(sep).join('/'));
  }
  return files.sort();
}

export function parseArtifactArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--') continue;
    if (argv[i] === '--output-dir') options.outputDir = argv[++i];
    else if (argv[i] === '--target') options.target = argv[++i];
    else if (argv[i] === '--skip-build') options.skipBuild = true;
    else throw new Error(`unknown artifact argument: ${argv[i]}`);
  }
  if (!options.outputDir || !isAbsolute(options.outputDir)) throw new Error('--output-dir must be absolute');
  if (!options.target) throw new Error('--target is required');
  const outputDir = resolve(options.outputDir);
  const repoRelative = relative(REPO_ROOT, outputDir);
  if (repoRelative === '' || (!repoRelative.startsWith('..') && !isAbsolute(repoRelative))) {
    throw new Error('release artifacts must be written outside the repository');
  }
  return { ...options, outputDir, target: assertWebReleaseTarget(options.target) };
}

export async function buildArtifact(options) {
  const parsed = parseArtifactArgs([
    '--output-dir', options.outputDir,
    '--target', options.target ?? 'web',
    ...(options.skipBuild ? ['--skip-build'] : []),
  ]);
  assertLinuxArtifactHost(process.platform, process.arch);
  assertCleanWorktree(await run('git', ['status', '--porcelain'], { capture: true }));
  const gitSha = await run('git', ['rev-parse', 'HEAD'], { capture: true });
  assertReleaseSha(gitSha);
  if (!parsed.skipBuild) {
    for (const command of releaseBuildCommands(parsed.target)) {
      await run(COREPACK, ['pnpm@10.33.2', command], { shell: process.platform === 'win32' });
    }
  }

  await mkdir(parsed.outputDir, { recursive: true });
  const tempDir = await mkdtemp(join(tmpdir(), 'nongchang-release-'));
  const payload = join(tempDir, 'payload');
  const deployment = join(tempDir, 'backend-deployment');
  await mkdir(payload, { recursive: true });
  try {
    await run(COREPACK, [
      'pnpm@10.33.2', '--filter', '@nongchang/backend', 'deploy', '--prod', '--legacy', deployment,
    ], { shell: process.platform === 'win32' });
    for (const [target, source] of artifactSourceEntries(parsed.target)) {
      if (!(await stat(join(REPO_ROOT, source)).catch(() => null))) throw new Error(`missing release input: ${source}`);
      await cp(join(REPO_ROOT, source), join(payload, target), { recursive: true });
    }
    await copyPortableDependencyTree(join(deployment, 'node_modules'), join(payload, 'node_modules'));
    const prismaClientPackage = BACKEND_REQUIRE.resolve('@prisma/client/package.json');
    const generatedPrismaClient = generatedPrismaClientDirectory(prismaClientPackage);
    await cp(generatedPrismaClient, join(payload, 'node_modules/.prisma/client'), { recursive: true });
    await mkdir(join(payload, 'packages/backend'), { recursive: true });
    await mkdir(join(payload, 'packages/shared'), { recursive: true });
    await cp(join(REPO_ROOT, 'packages/backend/package.json'), join(payload, 'packages/backend/package.json'));
    await cp(join(REPO_ROOT, 'packages/shared/package.json'), join(payload, 'packages/shared/package.json'));
    await cp(join(REPO_ROOT, 'pnpm-lock.yaml'), join(payload, 'pnpm-lock.yaml'));
    await cp(join(REPO_ROOT, 'package.json'), join(payload, 'package.json'));

    const presentRequiredEntries = [];
    for (const path of WEB_REQUIRED_ARTIFACT_ENTRIES) {
      if (await stat(join(payload, path)).catch(() => null)) presentRequiredEntries.push(path);
    }
    assertRequiredArtifactEntries(presentRequiredEntries);

    const paths = await listFiles(payload);
    assertWebArtifactPayload(paths);
    const files = {};
    for (const path of paths) files[path] = await sha256File(join(payload, path));
    const payloadManifest = createPayloadManifest(gitSha, parsed.target, files);
    await writeFile(join(payload, 'artifact-manifest.json'), `${JSON.stringify(payloadManifest, null, 2)}\n`);

    const archiveName = `nongchang-${gitSha}.tar.gz`;
    const archivePath = join(parsed.outputDir, archiveName);
    await run('tar', ['-czf', archivePath, '-C', payload, '.']);
    const manifest = {
      ...payloadManifest,
      builtAt: new Date().toISOString(),
      archive: archiveName,
      archiveSha256: await sha256File(archivePath),
    };
    const manifestPath = join(parsed.outputDir, `nongchang-${gitSha}.manifest.json`);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    return { archivePath, manifestPath, manifest };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArtifactArgs(process.argv.slice(2));
  buildArtifact(options).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`artifact build failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
