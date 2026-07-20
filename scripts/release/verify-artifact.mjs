import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, readlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertArtifactManifestContract,
  assertReleaseSha,
  assertWebArtifactPayload,
  assertWebReleaseTarget,
} from './artifact-contract.mjs';

async function sha256File(path) {
  const hash = createHash('sha256');
  const info = await lstat(path);
  if (info.isSymbolicLink()) hash.update(`symlink:${await readlink(path)}`);
  else hash.update(await readFile(path));
  return hash.digest('hex');
}

async function listPayloadFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listPayloadFiles(root, path));
    else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name !== 'artifact-manifest.json') {
      files.push(relative(root, path).split(sep).join('/'));
    }
  }
  return files.sort();
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

export async function verifyReleaseArtifact({ archive, manifestFile, releaseDir, expectedGitSha, expectedTarget }) {
  for (const [label, path] of Object.entries({ archive, manifestFile, releaseDir })) {
    if (!path || !isAbsolute(path)) throw new Error(`${label} must be an absolute path`);
  }
  assertReleaseSha(expectedGitSha);
  assertWebReleaseTarget(expectedTarget);
  if (basename(releaseDir) !== expectedGitSha) throw new Error('release directory must be named with the expected Git SHA');

  const external = JSON.parse(await readFile(manifestFile, 'utf8'));
  assertArtifactManifestContract(external, expectedGitSha, expectedTarget);
  if (external.archive !== basename(archive)) throw new Error('artifact archive name does not match the external manifest');
  if (!/^[0-9a-f]{64}$/.test(external.archiveSha256 ?? '')) throw new Error('external manifest archive SHA-256 is invalid');
  if (await sha256File(archive) !== external.archiveSha256) throw new Error('artifact archive SHA-256 mismatch');

  const embedded = await readAndAssertArtifactManifest(releaseDir, expectedGitSha, expectedTarget);
  if (JSON.stringify(embedded.files) !== JSON.stringify(external.files)) {
    throw new Error('embedded artifact manifest does not match the external manifest');
  }

  const paths = await listPayloadFiles(releaseDir);
  assertWebArtifactPayload(paths);
  const expectedPaths = Object.keys(external.files).sort();
  if (JSON.stringify(paths) !== JSON.stringify(expectedPaths)) throw new Error('artifact payload file set mismatch');
  for (const path of expectedPaths) {
    const payloadPath = join(releaseDir, path);
    const info = await lstat(payloadPath);
    if (info.isSymbolicLink()) assertPortableSymlink(releaseDir, payloadPath, await readlink(payloadPath));
    if (await sha256File(payloadPath) !== external.files[path]) throw new Error(`artifact payload hash mismatch: ${path}`);
  }
  return { status: 'ok', gitSha: expectedGitSha, target: expectedTarget, filesVerified: expectedPaths.length };
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
