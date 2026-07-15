import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyReleaseArtifact } from './verify-artifact.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('server verification checks archive identity and every extracted payload file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-verify-artifact-'));
  try {
    const gitSha = 'a'.repeat(40);
    const archive = join(root, `nongchang-${gitSha}.tar.gz`);
    const release = join(root, gitSha);
    const manifestFile = join(root, `nongchang-${gitSha}.manifest.json`);
    await mkdir(join(release, 'backend'), { recursive: true });
    await writeFile(archive, 'immutable archive bytes');
    await writeFile(join(release, 'backend', 'main.js'), 'compiled backend');
    const files = { 'backend/main.js': sha256('compiled backend') };
    const payloadManifest = { schemaVersion: 1, gitSha, files };
    const manifest = {
      ...payloadManifest,
      archive: `nongchang-${gitSha}.tar.gz`,
      archiveSha256: sha256('immutable archive bytes'),
    };
    await writeFile(join(release, 'artifact-manifest.json'), `${JSON.stringify(payloadManifest)}\n`);
    await writeFile(manifestFile, `${JSON.stringify(manifest)}\n`);

    const result = await verifyReleaseArtifact({ archive, manifestFile, releaseDir: release, expectedGitSha: gitSha });
    assert.deepEqual(result, { status: 'ok', gitSha, filesVerified: 1 });

    await writeFile(join(release, 'backend', 'main.js'), 'tampered');
    await assert.rejects(
      () => verifyReleaseArtifact({ archive, manifestFile, releaseDir: release, expectedGitSha: gitSha }),
      /payload hash mismatch: backend\/main\.js/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('server verification rejects archive, SHA, embedded manifest, and file-set drift', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-verify-artifact-'));
  try {
    const gitSha = 'b'.repeat(40);
    const archive = join(root, `nongchang-${gitSha}.tar.gz`);
    const release = join(root, gitSha);
    const manifestFile = join(root, `nongchang-${gitSha}.manifest.json`);
    await mkdir(release, { recursive: true });
    await writeFile(archive, 'archive');
    await writeFile(join(release, 'app.js'), 'app');
    const files = { 'app.js': sha256('app') };
    const external = {
      schemaVersion: 1,
      gitSha,
      files,
      archive: `nongchang-${gitSha}.tar.gz`,
      archiveSha256: sha256('archive'),
    };
    await writeFile(manifestFile, JSON.stringify(external));
    await writeFile(join(release, 'artifact-manifest.json'), JSON.stringify({ schemaVersion: 1, gitSha, files }));

    await assert.rejects(
      () => verifyReleaseArtifact({ archive, manifestFile, releaseDir: release, expectedGitSha: 'c'.repeat(40) }),
      /expected Git SHA/,
    );
    await writeFile(archive, 'changed archive');
    await assert.rejects(
      () => verifyReleaseArtifact({ archive, manifestFile, releaseDir: release, expectedGitSha: gitSha }),
      /archive SHA-256 mismatch/,
    );
    await writeFile(archive, 'archive');
    await writeFile(join(release, 'extra.txt'), 'unexpected');
    await assert.rejects(
      () => verifyReleaseArtifact({ archive, manifestFile, releaseDir: release, expectedGitSha: gitSha }),
      /payload file set mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
