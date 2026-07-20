import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ARTIFACT_MANIFEST_SCHEMA_VERSION,
  WEB_REQUIRED_ARTIFACT_ENTRIES,
  WEB_RELEASE_TARGET,
  assertArtifactManifestContract,
  assertWebArtifactPayload,
  assertWebReleaseTarget,
  releaseArchiveName,
  releaseManifestName,
} from './artifact-contract.mjs';

test('Web contract accepts only an explicit Web target', () => {
  assert.equal(WEB_RELEASE_TARGET, 'web');
  assert.equal(ARTIFACT_MANIFEST_SCHEMA_VERSION, 2);
  assert.equal(assertWebReleaseTarget('web'), 'web');
  assert.throws(() => assertWebReleaseTarget(), /release target must be web/);
  assert.throws(() => assertWebReleaseTarget('miniapp'), /release target must be web/);
});

test('immutable archive and manifest names include the full expected Git SHA', () => {
  const gitSha = 'c'.repeat(40);
  assert.equal(releaseArchiveName(gitSha), `nongchang-${gitSha}.tar.gz`);
  assert.equal(releaseManifestName(gitSha), `nongchang-${gitSha}.manifest.json`);
  assert.throws(() => releaseArchiveName('abc123'), /40-character Git SHA/);
});

test('manifest requires schema 2, Web target, SHA, and files', () => {
  const gitSha = 'a'.repeat(40);
  const manifest = {
    schemaVersion: 2,
    target: 'web',
    gitSha,
    provenance: { platform: 'linux', arch: 'x64' },
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
    () => assertArtifactManifestContract({ ...manifest, provenance: { platform: 'win32', arch: 'x64' } }, gitSha, 'web'),
    /Linux x64 provenance/,
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

test('Web artifact contract includes the Baota runtime and release switch inputs', () => {
  for (const path of [
    'ops/data-stack/compose.production.yml',
    'ops/data-stack/data-stack.env.example',
    'ops/pm2/ecosystem.config.cjs',
    'ops/nginx/active-api.conf.example',
    'ops/nginx/farm.qingyouai.com.conf.template',
    'ops/runtime/production.env.example',
    'ops/logrotate/nongchang',
    'scripts/release/switch-release.mjs',
  ]) {
    assert.ok(WEB_REQUIRED_ARTIFACT_ENTRIES.includes(path), `missing artifact contract entry: ${path}`);
  }
});

test('tag release gates the immutable Web artifact without committed production credentials', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');
  const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

  assert.equal(packageJson.scripts['release:test'], 'node --test scripts/release/*.test.mjs');
  assert.equal(
    packageJson.scripts['verify:release:web'],
    'pnpm build:shared && pnpm build:backend && pnpm typecheck:web && pnpm lint && pnpm test:unit && pnpm test:e2e && pnpm build:web && pnpm audit:prod',
  );
  assert.match(workflow, /runs-on:\s*ubuntu-latest/);
  assert.match(workflow, /environment:\s*production-web/);
  assert.match(workflow, /VITE_PUBLIC_SALES_CONTACT:\s*\$\{\{\s*vars\.VITE_PUBLIC_SALES_CONTACT\s*\}\}/);
  assert.doesNotMatch(workflow, /TARO_APP_(?:API|WX_APPID|SUPPORT_CONTACT)/);
  for (const command of [
    'pnpm verify:release:web',
    'pnpm test:browser',
    'pnpm test:accessibility',
    'pnpm --filter @nongchang/backend db:query-plans',
    'pnpm backup:verify-restore',
    'pnpm audit:prod',
    'pnpm release:test',
    'pnpm release:artifact -- --target web',
  ]) {
    assert.ok(workflow.includes(command), `missing workflow command: ${command}`);
  }
  assert.match(workflow, /Verify immutable artifact archive/);
  assert.match(workflow, /--expected-target web/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}/);
});
