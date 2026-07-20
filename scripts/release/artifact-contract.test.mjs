import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARTIFACT_MANIFEST_SCHEMA_VERSION,
  WEB_REQUIRED_ARTIFACT_ENTRIES,
  WEB_RELEASE_TARGET,
  assertArtifactManifestContract,
  assertWebArtifactPayload,
  assertWebReleaseTarget,
} from './artifact-contract.mjs';

test('Web contract accepts only an explicit Web target', () => {
  assert.equal(WEB_RELEASE_TARGET, 'web');
  assert.equal(ARTIFACT_MANIFEST_SCHEMA_VERSION, 2);
  assert.equal(assertWebReleaseTarget('web'), 'web');
  assert.throws(() => assertWebReleaseTarget(), /release target must be web/);
  assert.throws(() => assertWebReleaseTarget('miniapp'), /release target must be web/);
});

test('manifest requires schema 2, Web target, SHA, and files', () => {
  const gitSha = 'a'.repeat(40);
  const manifest = {
    schemaVersion: 2,
    target: 'web',
    gitSha,
    files: { 'web/index.html': 'b'.repeat(64) },
  };
  assert.deepEqual(assertArtifactManifestContract(manifest, gitSha, 'web'), manifest);
  assert.throws(
    () => assertArtifactManifestContract({ ...manifest, schemaVersion: 1 }, gitSha, 'web'),
    /schemaVersion must be 2/,
  );
  assert.throws(
    () => assertArtifactManifestContract({ ...manifest, target: 'miniapp' }, gitSha, 'web'),
    /target does not match/,
  );
  assert.throws(
    () => assertArtifactManifestContract({ ...manifest, gitSha: 'abc123' }, gitSha, 'web'),
    /lowercase 40-character Git SHA/,
  );
  assert.throws(
    () => assertArtifactManifestContract({ ...manifest, files: [] }, gitSha, 'web'),
    /files map is required/,
  );
  assert.throws(
    () => assertArtifactManifestContract({ ...manifest, files: { '../outside': 'b'.repeat(64) } }, gitSha, 'web'),
    /file path must be portable/,
  );
});

test('Web payload requires runtime inputs and rejects miniapp output', () => {
  assert.ok(WEB_REQUIRED_ARTIFACT_ENTRIES.includes('scripts/release/artifact-contract.mjs'));
  assert.ok(WEB_REQUIRED_ARTIFACT_ENTRIES.includes('scripts/release/verify-artifact.mjs'));
  assert.ok(WEB_REQUIRED_ARTIFACT_ENTRIES.includes('scripts/release/server-preflight.mjs'));
  assert.doesNotThrow(() => assertWebArtifactPayload(WEB_REQUIRED_ARTIFACT_ENTRIES));
  assert.throws(
    () => assertWebArtifactPayload(WEB_REQUIRED_ARTIFACT_ENTRIES.filter((path) => path !== 'web/index.html')),
    /web\/index\.html/,
  );
  assert.throws(
    () => assertWebArtifactPayload([...WEB_REQUIRED_ARTIFACT_ENTRIES, 'miniapp/app.js']),
    /must not contain miniapp payload/,
  );
});
