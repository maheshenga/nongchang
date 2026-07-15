import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, readlink } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertReleaseSha } from './server-preflight.mjs';

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

function assertManifestShape(manifest, expectedGitSha) {
  if (manifest?.schemaVersion !== 1) throw new Error('artifact manifest schemaVersion must be 1');
  assertReleaseSha(manifest.gitSha);
  if (manifest.gitSha !== expectedGitSha) throw new Error('artifact manifest does not match the expected Git SHA');
  if (!manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    throw new Error('artifact manifest files map is required');
  }
}

export async function verifyReleaseArtifact(options) {
  const { archive, manifestFile, releaseDir, expectedGitSha } = options;
  for (const [label, path] of Object.entries({ archive, manifestFile, releaseDir })) {
    if (!path || !isAbsolute(path)) throw new Error(`${label} must be an absolute path`);
  }
  assertReleaseSha(expectedGitSha);
  if (basename(releaseDir) !== expectedGitSha) throw new Error('release directory must be named with the expected Git SHA');

  const external = JSON.parse(await readFile(manifestFile, 'utf8'));
  assertManifestShape(external, expectedGitSha);
  if (external.archive !== basename(archive)) throw new Error('artifact archive name does not match the external manifest');
  if (!/^[0-9a-f]{64}$/.test(external.archiveSha256 ?? '')) throw new Error('external manifest archive SHA-256 is invalid');
  if (await sha256File(archive) !== external.archiveSha256) throw new Error('artifact archive SHA-256 mismatch');

  const embeddedPath = join(releaseDir, 'artifact-manifest.json');
  const embedded = JSON.parse(await readFile(embeddedPath, 'utf8'));
  assertManifestShape(embedded, expectedGitSha);
  if (JSON.stringify(embedded.files) !== JSON.stringify(external.files)) {
    throw new Error('embedded artifact manifest does not match the external manifest');
  }

  const paths = await listPayloadFiles(releaseDir);
  const expectedPaths = Object.keys(external.files).sort();
  if (JSON.stringify(paths) !== JSON.stringify(expectedPaths)) throw new Error('artifact payload file set mismatch');
  for (const path of expectedPaths) {
    if (await sha256File(join(releaseDir, path)) !== external.files[path]) {
      throw new Error(`artifact payload hash mismatch: ${path}`);
    }
  }
  return { status: 'ok', gitSha: expectedGitSha, filesVerified: expectedPaths.length };
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
    else throw new Error(`unknown artifact verification argument: ${key}`);
  }
  for (const name of ['archive', 'manifestFile', 'releaseDir', 'expectedGitSha']) {
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
