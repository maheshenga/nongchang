import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readlink, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { WEB_REQUIRED_ARTIFACT_ENTRIES } from './artifact-contract.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function tarHeader({ path, type = '0', linkpath = '', size = 0 }) {
  const block = Buffer.alloc(512, 0);
  block.write(path, 0, 100, 'utf8');
  block.write('0000777\0', 100, 8, 'ascii');
  block.write('0000000\0', 108, 8, 'ascii');
  block.write('0000000\0', 116, 8, 'ascii');
  block.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
  block.write('00000000000\0', 136, 12, 'ascii');
  block.fill(0x20, 148, 156);
  block.write(type, 156, 1, 'ascii');
  block.write(linkpath, 157, 100, 'utf8');
  block.write('ustar\0', 257, 6, 'ascii');
  block.write('00', 263, 2, 'ascii');
  const checksum = [...block].reduce((total, byte) => total + byte, 0);
  block.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return block;
}

function tarEntry(entry) {
  const content = Buffer.from(entry.content ?? '', 'utf8');
  const padding = Buffer.alloc((512 - content.length % 512) % 512, 0);
  return Buffer.concat([tarHeader({ ...entry, size: content.length }), content, padding]);
}

async function writeRawTarGz(path, entries) {
  const bytes = Buffer.concat([...entries.map(tarEntry), Buffer.alloc(1024, 0)]);
  await writeFile(path, gzipSync(bytes));
}

function tar(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn('tar', args, { windowsHide: true });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolveRun() : reject(new Error(`tar failed with exit code ${code}`)));
  });
}

async function loadVerifier() {
  return import('./verify-artifact.mjs');
}

async function writeRequiredWebPayload(release) {
  const files = {};
  for (const [index, path] of WEB_REQUIRED_ARTIFACT_ENTRIES.entries()) {
    const content = `web payload ${index}`;
    const payloadPath = join(release, path);
    await mkdir(dirname(payloadPath), { recursive: true });
    await writeFile(payloadPath, content);
    files[path] = sha256(content);
  }
  return files;
}

async function writeArtifact(root, gitSha, mutatePayload) {
  const archive = join(root, `nongchang-${gitSha}.tar.gz`);
  const payload = join(root, `payload-${gitSha}`);
  const release = join(root, gitSha);
  const manifestFile = join(root, `nongchang-${gitSha}.manifest.json`);
  await mkdir(payload, { recursive: true });
  const files = await writeRequiredWebPayload(payload);
  const embedded = { schemaVersion: 2, target: 'web', gitSha, provenance: { platform: 'linux', arch: 'x64' }, files };
  await writeFile(join(payload, 'artifact-manifest.json'), JSON.stringify(embedded));
  const external = {
    ...embedded,
    files: { ...files },
    archive: `nongchang-${gitSha}.tar.gz`,
  };
  if (mutatePayload) await mutatePayload({ payload, embedded, external });
  await tar(['-czf', archive, '-C', payload, '.']);
  external.archiveSha256 = sha256(await readFile(archive));
  await writeFile(manifestFile, JSON.stringify(external));
  return { archive, release, manifestFile, files };
}

test('verifies the archive, matching external and embedded manifests, and the extracted payload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-verify-artifact-'));
  try {
    const gitSha = 'a'.repeat(40);
    const artifact = await writeArtifact(root, gitSha);
    const { verifyReleaseArtifact } = await loadVerifier();
    const options = { archive: artifact.archive, manifestFile: artifact.manifestFile, releaseDir: artifact.release, expectedGitSha: gitSha, expectedTarget: 'web' };
    await assert.doesNotReject(() => verifyReleaseArtifact(options));

    await writeFile(artifact.archive, 'archive SHA drift');
    await assert.rejects(() => verifyReleaseArtifact(options), /archive SHA-256 mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a nonempty unrelated release directory instead of trusting it over the archive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-verify-artifact-'));
  try {
    const gitSha = 'b'.repeat(40);
    const artifact = await writeArtifact(root, gitSha);
    await mkdir(artifact.release, { recursive: true });
    await writeFile(join(artifact.release, 'forged-release.txt'), 'unrelated but trusted before extraction');
    const { verifyReleaseArtifact } = await loadVerifier();
    await assert.rejects(() => verifyReleaseArtifact({ archive: artifact.archive, manifestFile: artifact.manifestFile, releaseDir: artifact.release, expectedGitSha: gitSha, expectedTarget: 'web' }), /empty/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects unsafe archive entries before extraction', async () => {
  const { assertSafeArchiveEntry } = await loadVerifier();
  assert.throws(() => assertSafeArchiveEntry('../outside'), /portable/);
  assert.throws(() => assertSafeArchiveEntry('/etc/passwd'), /portable/);
  assert.doesNotThrow(() => assertSafeArchiveEntry({
    path: 'node_modules/.bin/prisma',
    type: 'SymbolicLink',
    linkpath: '../prisma/build/index.js',
  }));
  assert.doesNotThrow(() => assertSafeArchiveEntry({
    path: 'node_modules/prisma-cli',
    type: 'Link',
    linkpath: 'node_modules/prisma/build/index.js',
  }));
  assert.throws(
    () => assertSafeArchiveEntry({ path: 'links/hard-link', type: 'Link', linkpath: '../outside' }),
    /archive link target/i,
  );
  assert.doesNotThrow(() => assertSafeArchiveEntry('./web/index.html'));
});

test('runs the inventory callback before extracting the archive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-verify-artifact-'));
  try {
    const gitSha = '1'.repeat(40);
    const artifact = await writeArtifact(root, gitSha);
    const { verifyReleaseArtifact } = await loadVerifier();
    await assert.rejects(() => verifyReleaseArtifact({
      archive: artifact.archive,
      manifestFile: artifact.manifestFile,
      releaseDir: artifact.release,
      expectedGitSha: gitSha,
      expectedTarget: 'web',
      onBeforeExtract: async ({ estimatedReleaseBytes }) => {
        assert.ok(estimatedReleaseBytes > 0);
        await assert.rejects(() => stat(join(artifact.release, 'artifact-manifest.json')));
        throw new Error('pre-extraction capacity rejected');
      },
    }), /pre-extraction capacity rejected/);
    await assert.rejects(() => stat(join(artifact.release, 'artifact-manifest.json')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects escaping archive links before extraction leaves an outside sentinel untouched', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-verify-artifact-'));
  try {
    const gitSha = '2'.repeat(40);
    const archive = join(root, `nongchang-${gitSha}.tar.gz`);
    const manifestFile = join(root, `nongchang-${gitSha}.manifest.json`);
    const releaseDir = join(root, gitSha);
    const outsideDir = join(root, 'outside');
    const sentinel = join(outsideDir, 'sentinel.txt');
    await mkdir(outsideDir, { recursive: true });
    await writeFile(sentinel, 'unchanged');
    await writeRawTarGz(archive, [
      { path: 'escape', type: '2', linkpath: '../outside' },
      { path: 'escape/sentinel.txt', content: 'overwritten' },
    ]);
    await writeFile(manifestFile, JSON.stringify({
      schemaVersion: 2,
      target: 'web',
      gitSha,
      provenance: { platform: 'linux', arch: 'x64' },
      files: {},
      archive: `nongchang-${gitSha}.tar.gz`,
      archiveSha256: sha256(await readFile(archive)),
    }));
    const { verifyReleaseArtifact } = await loadVerifier();
    await assert.rejects(() => verifyReleaseArtifact({ archive, manifestFile, releaseDir, expectedGitSha: gitSha, expectedTarget: 'web' }), /archive link target/i);
    assert.equal(await readFile(sentinel, 'utf8'), 'unchanged');
    await assert.rejects(() => stat(releaseDir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('accepts matching embedded file maps regardless of JSON property order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-verify-artifact-'));
  try {
    const gitSha = 'f'.repeat(40);
    const artifact = await writeArtifact(root, gitSha, async ({ payload }) => {
      const embedded = JSON.parse(await readFile(join(payload, 'artifact-manifest.json'), 'utf8'));
      embedded.files = Object.fromEntries(Object.entries(embedded.files).reverse());
      await writeFile(join(payload, 'artifact-manifest.json'), JSON.stringify(embedded));
    });
    const { verifyReleaseArtifact } = await loadVerifier();
    await assert.doesNotReject(() => verifyReleaseArtifact({ archive: artifact.archive, manifestFile: artifact.manifestFile, releaseDir: artifact.release, expectedGitSha: gitSha, expectedTarget: 'web' }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects payload hash drift, embedded manifest drift, unexpected files, and escaping symlinks from the archive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-verify-artifact-'));
  try {
    const gitSha = 'b'.repeat(40);
    const artifact = await writeArtifact(root, gitSha, async ({ payload }) => {
      await writeFile(join(payload, 'backend', 'src', 'main.js'), 'tampered');
    });
    const { verifyReleaseArtifact } = await loadVerifier();
    await assert.rejects(() => verifyReleaseArtifact({ archive: artifact.archive, manifestFile: artifact.manifestFile, releaseDir: artifact.release, expectedGitSha: gitSha, expectedTarget: 'web' }), /payload hash mismatch: backend\/src\/main\.js/);

    const manifestDriftSha = 'c'.repeat(40);
    const manifestDrift = await writeArtifact(root, manifestDriftSha, async ({ payload }) => {
      const embedded = JSON.parse(await readFile(join(payload, 'artifact-manifest.json'), 'utf8'));
      embedded.files['web/index.html'] = 'c'.repeat(64);
      await writeFile(join(payload, 'artifact-manifest.json'), JSON.stringify(embedded));
    });
    await assert.rejects(() => verifyReleaseArtifact({ archive: manifestDrift.archive, manifestFile: manifestDrift.manifestFile, releaseDir: manifestDrift.release, expectedGitSha: manifestDriftSha, expectedTarget: 'web' }), /embedded artifact manifest does not match/);

    const extraFileSha = 'd'.repeat(40);
    const extraFile = await writeArtifact(root, extraFileSha, async ({ payload }) => writeFile(join(payload, 'extra.txt'), 'unexpected'));
    await assert.rejects(() => verifyReleaseArtifact({ archive: extraFile.archive, manifestFile: extraFile.manifestFile, releaseDir: extraFile.release, expectedGitSha: extraFileSha, expectedTarget: 'web' }), /payload file set mismatch/);

    const symlinkSha = 'e'.repeat(40);
    const escapedTarget = join(root, 'outside-release.js');
    await writeFile(escapedTarget, 'outside');
    const escapedSymlink = await writeArtifact(root, symlinkSha, async ({ payload, embedded, external }) => {
      const payloadLink = join(payload, 'node_modules', 'outside.js');
      await mkdir(dirname(payloadLink), { recursive: true });
      await symlink(escapedTarget, payloadLink);
      const hash = sha256(`symlink:${await readlink(payloadLink)}`);
      embedded.files['node_modules/outside.js'] = hash;
      external.files['node_modules/outside.js'] = hash;
      await writeFile(join(payload, 'artifact-manifest.json'), JSON.stringify(embedded));
    });
    await assert.rejects(() => verifyReleaseArtifact({ archive: escapedSymlink.archive, manifestFile: escapedSymlink.manifestFile, releaseDir: escapedSymlink.release, expectedGitSha: symlinkSha, expectedTarget: 'web' }), /archive link target/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
