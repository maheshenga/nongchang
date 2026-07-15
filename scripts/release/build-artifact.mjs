import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cp, lstat, mkdtemp, mkdir, readlink, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const COREPACK = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const BACKEND_REQUIRE = createRequire(join(REPO_ROOT, 'packages/backend/package.json'));

const REQUIRED_ARTIFACT_ENTRIES = Object.freeze([
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
  'package.json',
  'pnpm-lock.yaml',
]);

export function requiredArtifactEntries() {
  return [...REQUIRED_ARTIFACT_ENTRIES];
}

export function assertRequiredArtifactEntries(actualEntries) {
  const actual = new Set(actualEntries);
  const missing = REQUIRED_ARTIFACT_ENTRIES.filter((path) => !actual.has(path));
  if (missing.length) throw new Error(`release artifact is missing required runtime input: ${missing.join(', ')}`);
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

export function verifyArtifactManifest(manifest, expectedGitSha, actualFiles) {
  if (manifest.gitSha !== expectedGitSha) throw new Error('artifact manifest Git SHA mismatch');
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

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--') continue;
    if (argv[i] === '--output-dir') options.outputDir = argv[++i];
    else if (argv[i] === '--skip-build') options.skipBuild = true;
    else throw new Error(`unknown artifact argument: ${argv[i]}`);
  }
  if (!options.outputDir || !isAbsolute(options.outputDir)) throw new Error('--output-dir must be absolute');
  const outputDir = resolve(options.outputDir);
  const repoRelative = relative(REPO_ROOT, outputDir);
  if (repoRelative === '' || (!repoRelative.startsWith('..') && !isAbsolute(repoRelative))) {
    throw new Error('release artifacts must be written outside the repository');
  }
  return { ...options, outputDir };
}

export async function buildArtifact(options) {
  const parsed = parseArgs(['--output-dir', options.outputDir, ...(options.skipBuild ? ['--skip-build'] : [])]);
  assertLinuxArtifactHost(process.platform, process.arch);
  assertCleanWorktree(await run('git', ['status', '--porcelain'], { capture: true }));
  const gitSha = await run('git', ['rev-parse', 'HEAD'], { capture: true });
  if (!/^[0-9a-f]{40}$/.test(gitSha)) throw new Error('unable to resolve full Git SHA');
  if (!parsed.skipBuild) {
    await run(COREPACK, ['pnpm@10.33.2', 'build:shared'], { shell: process.platform === 'win32' });
    await run(COREPACK, ['pnpm@10.33.2', 'build:backend'], { shell: process.platform === 'win32' });
    await run(COREPACK, ['pnpm@10.33.2', 'build:web'], { shell: process.platform === 'win32' });
    await run(COREPACK, ['pnpm@10.33.2', 'build:miniapp'], { shell: process.platform === 'win32' });
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
    const sources = [
      ['backend', 'packages/backend/dist'],
      ['web', 'packages/web/dist'],
      ['miniapp', 'packages/miniapp/dist'],
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
    for (const [target, source] of sources) {
      if (!(await stat(join(REPO_ROOT, source)).catch(() => null))) throw new Error(`missing release input: ${source}`);
      await cp(join(REPO_ROOT, source), join(payload, target), { recursive: true });
    }
    await cp(join(deployment, 'node_modules'), join(payload, 'node_modules'), { recursive: true });
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
    for (const path of REQUIRED_ARTIFACT_ENTRIES) {
      if (await stat(join(payload, path)).catch(() => null)) presentRequiredEntries.push(path);
    }
    assertRequiredArtifactEntries(presentRequiredEntries);

    const files = {};
    for (const path of await listFiles(payload)) files[path] = await sha256File(join(payload, path));
    const payloadManifest = { schemaVersion: 1, gitSha, files };
    verifyArtifactManifest(payloadManifest, gitSha, files);
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
  const options = parseArgs(process.argv.slice(2));
  buildArtifact(options).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`artifact build failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
