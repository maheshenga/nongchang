import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, readlink, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertArtifactManifestContract,
  assertReleaseSha,
  assertWebArtifactPayload,
  assertWebReleaseTarget,
  releaseArchiveName,
  releaseManifestName,
} from './artifact-contract.mjs';

function runTar(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn('tar', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolveRun(stdout) : reject(new Error(`tar failed with exit code ${code}${stderr ? `: ${stderr.trim()}` : ''}`)));
  });
}

async function sha256File(path) {
  const hash = createHash('sha256');
  const info = await lstat(path);
  if (info.isSymbolicLink()) hash.update(`symlink:${await readlink(path)}`);
  else hash.update(await readFile(path));
  return hash.digest('hex');
}

export function assertSafeArchiveEntry(entry) {
  const path = entry.replace(/^\.\//, '').replace(/\/$/, '');
  if (path === '') return;
  const portablePath = !path.startsWith('/')
    && !path.includes('\\')
    && path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..' && !/^[a-zA-Z]:$/.test(segment));
  if (!portablePath) throw new Error(`archive entry path must be portable: ${entry}`);
}

async function assertSafeArchiveEntries(archive) {
  const entries = (await runTar(['-tzf', archive])).split(/\r?\n/).filter(Boolean);
  if (!entries.length) throw new Error('release archive contains no entries');
  for (const entry of entries) assertSafeArchiveEntry(entry);
}

async function prepareEmptyReleaseDir(releaseDir) {
  const info = await lstat(releaseDir).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (info && !info.isDirectory()) throw new Error('releaseDir must be an empty directory');
  if (info && (await readdir(releaseDir)).length > 0) throw new Error('releaseDir must be empty before artifact extraction');
  if (!info) await mkdir(releaseDir, { recursive: true });
}

async function listPayloadFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listPayloadFiles(root, path));
    else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name !== 'artifact-manifest.json') files.push(relative(root, path).split(sep).join('/'));
  }
  return files.sort();
}

async function measureReleaseBytes(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  let bytes = 0;
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) bytes += await measureReleaseBytes(root, path);
    else bytes += (await lstat(path)).size;
  }
  return bytes;
}

export async function readAndAssertArtifactManifest(releaseDir, expectedGitSha, expectedTarget) {
  const manifest = JSON.parse(await readFile(join(releaseDir, 'artifact-manifest.json'), 'utf8'));
  return assertArtifactManifestContract(manifest, expectedGitSha, expectedTarget);
}

function assertPortableSymlink(releaseDir, path, target) {
  const resolvedTarget = resolve(dirname(path), target);
  const releaseRelativeTarget = relative(releaseDir, resolvedTarget);
  if (isAbsolute(target) || releaseRelativeTarget === '..' || releaseRelativeTarget.startsWith(`..${sep}`) || isAbsolute(releaseRelativeTarget)) {
    throw new Error(`artifact symlink target must stay within the immutable release: ${relative(releaseDir, path)}`);
  }
}

function assertEqualFileMaps(embeddedFiles, externalFiles) {
  const embeddedPaths = Object.keys(embeddedFiles).sort();
  const externalPaths = Object.keys(externalFiles).sort();
  if (embeddedPaths.join('\n') !== externalPaths.join('\n') || embeddedPaths.some((path) => embeddedFiles[path] !== externalFiles[path])) {
    throw new Error('embedded artifact manifest does not match the external manifest');
  }
}

export async function verifyReleaseArtifact({ archive, manifestFile, releaseDir, expectedGitSha, expectedTarget }) {
  for (const [label, path] of Object.entries({ archive, manifestFile, releaseDir })) {
    if (!path || !isAbsolute(path)) throw new Error(`${label} must be an absolute path`);
  }
  assertReleaseSha(expectedGitSha);
  assertWebReleaseTarget(expectedTarget);
  const archiveName = releaseArchiveName(expectedGitSha);
  const manifestName = releaseManifestName(expectedGitSha);
  if (basename(archive) !== archiveName) throw new Error('artifact archive name must contain the expected Git SHA');
  if (basename(manifestFile) !== manifestName) throw new Error('artifact manifest name must contain the expected Git SHA');
  if (basename(releaseDir) !== expectedGitSha) throw new Error('release directory must be named with the expected Git SHA');

  const external = JSON.parse(await readFile(manifestFile, 'utf8'));
  assertArtifactManifestContract(external, expectedGitSha, expectedTarget);
  if (external.archive !== archiveName) throw new Error('artifact archive name does not match the external manifest');
  if (!/^[0-9a-f]{64}$/.test(external.archiveSha256 ?? '')) throw new Error('external manifest archive SHA-256 is invalid');
  const archiveSha256 = await sha256File(archive);
  if (archiveSha256 !== external.archiveSha256) throw new Error('artifact archive SHA-256 mismatch');

  await prepareEmptyReleaseDir(releaseDir);
  try {
    await assertSafeArchiveEntries(archive);
    await runTar(['-xzf', archive, '-C', releaseDir]);
    const embedded = await readAndAssertArtifactManifest(releaseDir, expectedGitSha, expectedTarget);
    assertEqualFileMaps(embedded.files, external.files);

    const paths = await listPayloadFiles(releaseDir);
    assertWebArtifactPayload(paths);
    const expectedPaths = Object.keys(external.files).sort();
    if (paths.join('\n') !== expectedPaths.join('\n')) throw new Error('artifact payload file set mismatch');
    for (const path of expectedPaths) {
      const payloadPath = join(releaseDir, path);
      const info = await lstat(payloadPath);
      if (info.isSymbolicLink()) assertPortableSymlink(releaseDir, payloadPath, await readlink(payloadPath));
      if (await sha256File(payloadPath) !== external.files[path]) throw new Error(`artifact payload hash mismatch: ${path}`);
    }
    return {
      status: 'ok',
      gitSha: expectedGitSha,
      target: expectedTarget,
      filesVerified: expectedPaths.length,
      archiveBytes: (await lstat(archive)).size,
      releaseBytes: await measureReleaseBytes(releaseDir),
    };
  } catch (error) {
    await rm(releaseDir, { recursive: true, force: true });
    throw error;
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') continue;
    const key = argv[index];
    const value = argv[++index];
    if (key === '--archive') options.archive = resolve(value);
    else if (key === '--manifest') options.manifestFile = resolve(value);
    else if (key === '--release-dir') options.releaseDir = resolve(value);
    else if (key === '--expected-sha') options.expectedGitSha = value;
    else if (key === '--expected-target') options.expectedTarget = value;
    else throw new Error(`unknown artifact verification argument: ${key}`);
  }
  for (const name of ['archive', 'manifestFile', 'releaseDir', 'expectedGitSha', 'expectedTarget']) {
    if (!options[name]) throw new Error(`--${name.replace('File', '').replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyReleaseArtifact(parseArgs(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`artifact verification failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}
