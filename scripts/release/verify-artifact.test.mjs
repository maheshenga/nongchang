import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { WEB_REQUIRED_ARTIFACT_ENTRIES } from './artifact-contract.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

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

async function writeArtifact(root, gitSha) {
  const archive = join(root, `nongchang-${gitSha}.tar.gz`);
  const release = join(root, gitSha);
  const manifestFile = join(root, `nongchang-${gitSha}.manifest.json`);
  await mkdir(release, { recursive: true });
  await writeFile(archive, 'immutable Web archive bytes');
  const files = await writeRequiredWebPayload(release);
  const embedded = { schemaVersion: 2, target: 'web', gitSha, files };
  const external = {
    ...embedded,
    archive: `nongchang-${gitSha}.tar.gz`,
    archiveSha256: sha256('immutable Web archive bytes'),
  };
  await writeFile(join(release, 'artifact-manifest.json'), JSON.stringify(embedded));
  await writeFile(manifestFile, JSON.stringify(external));
  return { archive, release, manifestFile, files };
}

test('verifies the archive, matching external and embedded manifests, and the extracted payload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-verify-artifact-'));
  try {
    const gitSha = 'a'.repeat(40);
    const artifact = await writeArtifact(root, gitSha);
    const { verifyReleaseArtifact } = await loadVerifier();
    await assert.doesNotReject(() => verifyReleaseArtifact({
      archive: artifact.archive,
      manifestFile: artifact.manifestFile,
      releaseDir: artifact.release,
      expectedGitSha: gitSha,
      expectedTarget: 'web',
    }));

    await writeFile(artifact.archive, 'archive SHA drift');
    await assert.rejects(() => verifyReleaseArtifact({
      archive: artifact.archive,
      manifestFile: artifact.manifestFile,
      releaseDir: artifact.release,
      expectedGitSha: gitSha,
      expectedTarget: 'web',
    }), /archive SHA-256 mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects payload hash drift, embedded manifest drift, unexpected files, and escaping symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-verify-artifact-'));
  try {
    const gitSha = 'b'.repeat(40);
    const artifact = await writeArtifact(root, gitSha);
    const { verifyReleaseArtifact } = await loadVerifier();
    await writeFile(join(artifact.release, 'backend', 'src', 'main.js'), 'tampered');
    await assert.rejects(() => verifyReleaseArtifact({
      archive: artifact.archive,
      manifestFile: artifact.manifestFile,
      releaseDir: artifact.release,
      expectedGitSha: gitSha,
      expectedTarget: 'web',
    }), /payload hash mismatch: backend\/src\/main\.js/);
    await writeFile(join(artifact.release, 'backend', 'src', 'main.js'), 'web payload 0');

    const driftedEmbedded = { schemaVersion: 2, target: 'web', gitSha, files: { ...artifact.files, 'web/index.html': 'c'.repeat(64) } };
    await writeFile(join(artifact.release, 'artifact-manifest.json'), JSON.stringify(driftedEmbedded));
    await assert.rejects(() => verifyReleaseArtifact({
      archive: artifact.archive,
      manifestFile: artifact.manifestFile,
      releaseDir: artifact.release,
      expectedGitSha: gitSha,
      expectedTarget: 'web',
    }), /embedded artifact manifest does not match/);

    await writeFile(join(artifact.release, 'artifact-manifest.json'), JSON.stringify({ schemaVersion: 2, target: 'web', gitSha, files: artifact.files }));
    await writeFile(join(artifact.release, 'extra.txt'), 'unexpected');
    await assert.rejects(() => verifyReleaseArtifact({
      archive: artifact.archive,
      manifestFile: artifact.manifestFile,
      releaseDir: artifact.release,
      expectedGitSha: gitSha,
      expectedTarget: 'web',
    }), /payload file set mismatch/);

    await rm(join(artifact.release, 'extra.txt'));
    const escapedTarget = join(root, 'outside-release.js');
    const payloadLink = join(artifact.release, 'node_modules', 'outside.js');
    await writeFile(escapedTarget, 'outside');
    await mkdir(dirname(payloadLink), { recursive: true });
    await symlink(escapedTarget, payloadLink);
    artifact.files['node_modules/outside.js'] = sha256(`symlink:${await readlink(payloadLink)}`);
    const external = {
      schemaVersion: 2,
      target: 'web',
      gitSha,
      files: artifact.files,
      archive: `nongchang-${gitSha}.tar.gz`,
      archiveSha256: sha256('immutable Web archive bytes'),
    };
    await writeFile(artifact.manifestFile, JSON.stringify(external));
    await writeFile(join(artifact.release, 'artifact-manifest.json'), JSON.stringify({ schemaVersion: 2, target: 'web', gitSha, files: artifact.files }));
    await assert.rejects(() => verifyReleaseArtifact({
      archive: artifact.archive,
      manifestFile: artifact.manifestFile,
      releaseDir: artifact.release,
      expectedGitSha: gitSha,
      expectedTarget: 'web',
    }), /symlink target.*release/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
