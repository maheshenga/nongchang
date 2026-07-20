import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cp, lstat, mkdtemp, mkdir, readlink, readdir, readFile, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARTIFACT_MANIFEST_SCHEMA_VERSION,
  ARTIFACT_PROVENANCE,
  WEB_REQUIRED_ARTIFACT_ENTRIES,
  assertArtifactManifestContract,
  assertReleaseSha,
  assertWebArtifactPayload,
  assertWebReleaseTarget,
  assertWebRuntimePathsResolveWithinRelease,
  releaseArchiveName,
  releaseManifestName,
} from './artifact-contract.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const COREPACK = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const BACKEND_REQUIRE = createRequire(join(REPO_ROOT, 'packages/backend/package.json'));
const PNPM_BACKEND_SELF_LINK = '.pnpm/node_modules/@nongchang/backend';
const BACKEND_DEPLOYMENT_ROOT = 'backend-deployment/node_modules';
const GENERATED_PRISMA_CLIENT_ROOT = 'generated-prisma-client';

export function requiredArtifactEntries() {
  return [...WEB_REQUIRED_ARTIFACT_ENTRIES];
}

export function assertRequiredArtifactEntries(actualEntries) {
  assertWebArtifactPayload(actualEntries);
}

export async function assertRuntimeArtifactPathsResolveWithinRelease(releaseRoot) {
  return assertWebRuntimePathsResolveWithinRelease(releaseRoot);
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
    ['packages/backend/package.json', 'packages/backend/package.json'],
    ['packages/shared/package.json', 'packages/shared/package.json'],
    ['package.json', 'package.json'],
    ['pnpm-lock.yaml', 'pnpm-lock.yaml'],
  ];
}

export function requiredArtifactInputMappings(target) {
  assertWebReleaseTarget(target);
  return [
    { target: 'backend/src/main.js', source: 'packages/backend/dist/src/main.js', producer: 'release-input' },
    { target: 'web/index.html', source: 'packages/web/dist/index.html', producer: 'release-input' },
    { target: 'shared/index.js', source: 'packages/shared/dist/index.js', producer: 'release-input' },
    { target: 'prisma/schema.prisma', source: 'packages/backend/prisma/schema.prisma', producer: 'release-input' },
    { target: 'packages/backend/package.json', source: 'packages/backend/package.json', producer: 'release-input' },
    { target: 'packages/shared/package.json', source: 'packages/shared/package.json', producer: 'release-input' },
    { target: 'node_modules/@prisma/client', source: `${BACKEND_DEPLOYMENT_ROOT}/@prisma/client`, producer: 'backend-deployment' },
    { target: 'node_modules/.prisma/client/schema.prisma', source: `${GENERATED_PRISMA_CLIENT_ROOT}/schema.prisma`, producer: 'generated-prisma-client' },
    { target: 'node_modules/prisma', source: `${BACKEND_DEPLOYMENT_ROOT}/prisma`, producer: 'backend-deployment' },
    { target: 'node_modules/.bin/prisma', source: `${BACKEND_DEPLOYMENT_ROOT}/.bin/prisma`, producer: 'backend-deployment' },
    { target: 'ops/pgbouncer/pgbouncer.ini', source: 'ops/pgbouncer/pgbouncer.ini', producer: 'release-input' },
    { target: 'ops/data-stack/compose.production.yml', source: 'ops/data-stack/compose.production.yml', producer: 'release-input' },
    { target: 'ops/data-stack/data-stack.env.example', source: 'ops/data-stack/data-stack.env.example', producer: 'release-input' },
    { target: 'ops/pm2/ecosystem.config.cjs', source: 'ops/pm2/ecosystem.config.cjs', producer: 'release-input' },
    { target: 'ops/nginx/active-release.conf.example', source: 'ops/nginx/active-release.conf.example', producer: 'release-input' },
    { target: 'ops/nginx/farm.qingyouai.com.conf.template', source: 'ops/nginx/farm.qingyouai.com.conf.template', producer: 'release-input' },
    { target: 'ops/runtime/production.env.example', source: 'ops/runtime/production.env.example', producer: 'release-input' },
    { target: 'ops/logrotate/nongchang', source: 'ops/logrotate/nongchang', producer: 'release-input' },
    { target: 'scripts/release/artifact-contract.mjs', source: 'scripts/release/artifact-contract.mjs', producer: 'release-input' },
    { target: 'scripts/release/verify-artifact.mjs', source: 'scripts/release/verify-artifact.mjs', producer: 'release-input' },
    { target: 'scripts/release/server-preflight.mjs', source: 'scripts/release/server-preflight.mjs', producer: 'release-input' },
    { target: 'scripts/release/switch-release.mjs', source: 'scripts/release/switch-release.mjs', producer: 'release-input' },
    { target: 'scripts/lib/backup-format.mjs', source: 'scripts/lib/backup-format.mjs', producer: 'release-input' },
    { target: 'scripts/backup-postgres.mjs', source: 'scripts/backup-postgres.mjs', producer: 'release-input' },
    { target: 'package.json', source: 'package.json', producer: 'release-input' },
    { target: 'pnpm-lock.yaml', source: 'pnpm-lock.yaml', producer: 'release-input' },
  ];
}

function pathIsWithin(root, path) {
  return path === root || path.startsWith(`${root}/`);
}

export function assertRequiredArtifactInputMappings(target) {
  const mappings = requiredArtifactInputMappings(target);
  const sourceEntries = artifactSourceEntries(target);
  const targets = mappings.map(({ target: mappedTarget }) => mappedTarget).sort();
  const requiredTargets = requiredArtifactEntries().sort();
  if (new Set(targets).size !== targets.length || targets.join('\n') !== requiredTargets.join('\n')) {
    throw new Error('every required artifact path must have exactly one input mapping');
  }
  for (const mapping of mappings) {
    if (mapping.producer === 'release-input') {
      const isMapped = sourceEntries.some(([targetRoot, sourceRoot]) => (
        pathIsWithin(targetRoot, mapping.target) && pathIsWithin(sourceRoot, mapping.source)
      ));
      if (!isMapped) throw new Error(`artifact input mapping has no release source: ${mapping.target}`);
    } else if (mapping.producer === 'backend-deployment') {
      if (!pathIsWithin('node_modules', mapping.target) || !pathIsWithin(BACKEND_DEPLOYMENT_ROOT, mapping.source)) {
        throw new Error(`artifact input mapping has no backend deployment output: ${mapping.target}`);
      }
    } else if (mapping.producer === 'generated-prisma-client') {
      if (!pathIsWithin('node_modules/.prisma/client', mapping.target) || !pathIsWithin(GENERATED_PRISMA_CLIENT_ROOT, mapping.source)) {
        throw new Error(`artifact input mapping has no generated Prisma output: ${mapping.target}`);
      }
    } else {
      throw new Error(`unknown artifact input mapping producer: ${mapping.producer}`);
    }
  }
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
    provenance: ARTIFACT_PROVENANCE,
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
    const sourceInfo = await lstat(sourcePath);
    if (!sourceInfo.isSymbolicLink()) {
      if (sourceInfo.isDirectory()) await rebaseDependencySymlinks(sourceRoot, destinationRoot, sourcePath);
      continue;
    }

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

export async function listArtifactFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) files.push(relative(root, path).split(sep).join('/'));
    else if (info.isDirectory()) files.push(...await listArtifactFiles(root, path));
    else if (info.isFile()) files.push(relative(root, path).split(sep).join('/'));
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

export function normalizeBuildArtifactOptions(options = {}) {
  if (!options.outputDir) throw new Error('--output-dir must be absolute');
  return parseArtifactArgs([
    '--output-dir', options.outputDir,
    '--target', options.target ?? 'web',
    ...(options.skipBuild ? ['--skip-build'] : []),
  ]);
}

export async function buildArtifact(options) {
  const parsed = normalizeBuildArtifactOptions(options);
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
    assertRequiredArtifactInputMappings(parsed.target);
    await run(COREPACK, [
      'pnpm@10.33.2', '--filter', '@nongchang/backend', 'deploy', '--prod', '--legacy', deployment,
    ], { shell: process.platform === 'win32' });
    for (const [target, source] of artifactSourceEntries(parsed.target)) {
      if (!(await stat(join(REPO_ROOT, source)).catch(() => null))) throw new Error(`missing release input: ${source}`);
      const destination = join(payload, target);
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(REPO_ROOT, source), destination, { recursive: true });
    }
    await copyPortableDependencyTree(join(deployment, 'node_modules'), join(payload, 'node_modules'));
    const prismaClientPackage = BACKEND_REQUIRE.resolve('@prisma/client/package.json');
    const generatedPrismaClient = generatedPrismaClientDirectory(prismaClientPackage);
    await cp(generatedPrismaClient, join(payload, 'node_modules/.prisma/client'), { recursive: true });

    const presentRequiredEntries = [];
    for (const path of WEB_REQUIRED_ARTIFACT_ENTRIES) {
      if (await stat(join(payload, path)).catch(() => null)) presentRequiredEntries.push(path);
    }
    assertRequiredArtifactEntries(presentRequiredEntries);

    const paths = await listArtifactFiles(payload);
    assertWebArtifactPayload(paths);
    await assertRuntimeArtifactPathsResolveWithinRelease(payload);
    const files = {};
    for (const path of paths) files[path] = await sha256File(join(payload, path));
    const payloadManifest = createPayloadManifest(gitSha, parsed.target, files);
    await writeFile(join(payload, 'artifact-manifest.json'), `${JSON.stringify(payloadManifest, null, 2)}\n`);

    const archiveName = releaseArchiveName(gitSha);
    const archivePath = join(parsed.outputDir, archiveName);
    await run('tar', ['-czf', archivePath, '-C', payload, '.']);
    const manifest = {
      ...payloadManifest,
      builtAt: new Date().toISOString(),
      archive: archiveName,
      archiveSha256: await sha256File(archivePath),
    };
    const manifestPath = join(parsed.outputDir, releaseManifestName(gitSha));
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
