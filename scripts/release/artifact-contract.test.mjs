import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';
import {
  ARTIFACT_MANIFEST_SCHEMA_VERSION,
  WEB_REQUIRED_ARTIFACT_ENTRIES,
  WEB_REQUIRED_RUNTIME_PATHS,
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

test('Web archive entries keep pnpm directory links physical and declare their resolved runtime paths separately', () => {
  assert.ok(WEB_REQUIRED_ARTIFACT_ENTRIES.includes('node_modules/@prisma/client'));
  assert.ok(WEB_REQUIRED_ARTIFACT_ENTRIES.includes('node_modules/prisma'));
  assert.equal(WEB_REQUIRED_ARTIFACT_ENTRIES.includes('node_modules/@prisma/client/package.json'), false);
  assert.equal(WEB_REQUIRED_ARTIFACT_ENTRIES.includes('node_modules/prisma/package.json'), false);
  assert.deepEqual(WEB_REQUIRED_RUNTIME_PATHS, [
    'node_modules/@prisma/client/package.json',
    'node_modules/.prisma/client/schema.prisma',
    'node_modules/prisma/package.json',
    'node_modules/.bin/prisma',
  ]);
});

test('Web artifact contract includes the Baota runtime and release switch inputs', () => {
  for (const path of [
    'ops/data-stack/compose.production.yml',
    'ops/data-stack/data-stack.env.example',
    'ops/pm2/ecosystem.config.cjs',
    'ops/nginx/active-release.conf.example',
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
  const ciWorkflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const parsedWorkflow = parseYaml(workflow);
  const ciBrowserEnv = parseYaml(ciWorkflow).jobs.browser.env;
  const releaseEnv = parsedWorkflow.jobs['build-once'].env;
  const steps = parsedWorkflow.jobs['build-once'].steps;
  const commands = steps.map((step) => step.run).filter(Boolean);
  const expectedBrowserFixtures = {
    E2E_TENANT_CODE: 'DEMO',
    E2E_USERNAME: 'merchantA',
    E2E_PASSWORD: 'password123',
    E2E_BILLING_USERNAME: 'agentA',
  };

  assert.equal(packageJson.scripts['release:test'], 'node --test scripts/release/*.test.mjs');
  assert.equal(
    packageJson.scripts['verify:release:web'],
    'pnpm build:shared && pnpm build:backend && pnpm typecheck:web && pnpm lint && pnpm test:unit && pnpm test:e2e && pnpm build:web',
  );
  assert.match(workflow, /runs-on:\s*ubuntu-latest/);
  assert.match(workflow, /environment:\s*production-web/);
  assert.match(workflow, /VITE_PUBLIC_SALES_CONTACT:\s*\$\{\{\s*vars\.VITE_PUBLIC_SALES_CONTACT\s*\}\}/);
  for (const [name, expectedValue] of Object.entries(expectedBrowserFixtures)) {
    assert.equal(ciBrowserEnv[name], expectedValue);
    assert.equal(releaseEnv[name], expectedValue);
    assert.doesNotMatch(String(ciBrowserEnv[name]), /\$\{\{/);
    assert.doesNotMatch(String(releaseEnv[name]), /\$\{\{/);
  }
  assert.equal(releaseEnv.BACKUP_ENCRYPTION_KEY, '1111111111111111111111111111111111111111111111111111111111111111');
  assert.doesNotMatch(workflow, /TARO_APP_(?:API|WX_APPID|SUPPORT_CONTACT)/);
  const orderedCommands = [
    'pnpm verify:release:web',
    'pnpm test:browser',
    'pnpm test:accessibility',
    'pnpm --filter @nongchang/backend db:query-plans',
    'pnpm backup:verify-restore',
    'pnpm audit:prod',
    'pnpm release:test',
    'pnpm release:artifact -- --target web',
  ];
  assert.deepEqual(commands.filter((command) => orderedCommands.some((expected) => command.includes(expected))).map(
    (command) => orderedCommands.find((expected) => command.includes(expected)),
  ), orderedCommands);
  assert.equal(commands.filter((command) => command.includes('pnpm audit:prod')).length, 1);
  assert.match(workflow, /Verify immutable artifact archive/);
  assert.match(workflow, /--expected-target web/);
  const verifyIndex = steps.findIndex((step) => step.name === 'Verify immutable artifact archive');
  const toolingIndex = steps.findIndex((step) => step.name === 'Create first-host release tooling bundle');
  const uploadIndex = steps.findIndex((step) => step.uses === 'actions/upload-artifact@v4');
  assert.ok(verifyIndex >= 0 && toolingIndex > verifyIndex && uploadIndex > toolingIndex);
  const tooling = steps[toolingIndex].run;
  assert.match(tooling, /tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner/);
  assert.match(tooling, /gzip -n/);
  assert.match(tooling, /toolingArchiveSha256/);
  assert.match(tooling, /sourceManifestSha256/);
  assert.match(tooling, /scripts\/release\/(?:verify-artifact|server-preflight|switch-release)\.mjs/);
  assert.match(tooling, /cp -a "\$release\/ops" "\$stage\/ops"/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}/);
});

test('restricted runtime env includes backup encryption key without a committed value', async () => {
  const runtimeEnv = await readFile(new URL('../../ops/runtime/production.env.example', import.meta.url), 'utf8');
  assert.match(runtimeEnv, /^BACKUP_ENCRYPTION_KEY=$/m);
  assert.doesNotMatch(runtimeEnv, /^BACKUP_ENCRYPTION_KEY=.+$/m);
});

test('Nginx serves Web and API from one active release include', async () => {
  const nginx = await readFile(new URL('../../ops/nginx/farm.qingyouai.com.conf.template', import.meta.url), 'utf8');
  assert.equal((nginx.match(/include \/www\/wwwroot\/farm\.qingyouai\.com\/shared\/active-release\.conf;/g) ?? []).length, 1);
  assert.match(nginx, /proxy_pass \$nongchang_api_origin;/);
  assert.doesNotMatch(nginx, /current\/web|active-api\.conf/);
});

test('Baota bootstrap uses tooling ops and documents the real transactional commit order', async () => {
  const baota = await readFile(new URL('../../docs/deploy/baota.md', import.meta.url), 'utf8');
  assert.match(baota, /cp -a "\$TOOL_ROOT\/ops\/\." "\$BOOTSTRAP_OPS\/"/);
  for (const path of [
    '$TOOL_ROOT/ops/nginx/active-release.conf.example',
    '$TOOL_ROOT/ops/nginx/farm.qingyouai.com.conf.template',
    '$TOOL_ROOT/ops/runtime/production.env.example',
    '$TOOL_ROOT/ops/data-stack/data-stack.env.example',
    '$TOOL_ROOT/ops/logrotate/nongchang',
    '$TOOL_ROOT/ops/pm2/ecosystem.config.cjs',
    '$TOOL_ROOT/ops/data-stack/compose.production.yml',
  ]) assert.ok(baota.includes(path), `missing tooling bootstrap path: ${path}`);

  const summary = baota.split('\n').find((line) => line.startsWith('Supply the smoke identity')) ?? '';
  const order = [
    'candidate readiness',
    'public smoke',
    'worker health',
    'convenience links',
    'deploy state',
  ].map((value) => summary.indexOf(value));
  assert.ok(order.every((index) => index >= 0), 'release summary is missing a transaction stage');
  assert.deepEqual([...order].sort((left, right) => left - right), order);
  assert.doesNotMatch(summary, /current.*traffic staging|state.*before.*worker/i);
});
