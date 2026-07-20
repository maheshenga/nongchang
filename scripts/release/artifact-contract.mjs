export const WEB_RELEASE_TARGET = 'web';
export const ARTIFACT_MANIFEST_SCHEMA_VERSION = 2;

export const WEB_REQUIRED_ARTIFACT_ENTRIES = Object.freeze([
  'backend/src/main.js',
  'web/index.html',
  'shared/index.js',
  'prisma/schema.prisma',
  'packages/backend/package.json',
  'packages/shared/package.json',
  'node_modules/@prisma/client/package.json',
  'node_modules/.prisma/client/schema.prisma',
  'node_modules/prisma/package.json',
  'node_modules/.bin/prisma',
  'ops/pgbouncer/pgbouncer.ini',
  'scripts/release/artifact-contract.mjs',
  'scripts/lib/backup-format.mjs',
  'scripts/backup-postgres.mjs',
  'package.json',
  'pnpm-lock.yaml',
]);

export function assertWebReleaseTarget(target) {
  if (target !== WEB_RELEASE_TARGET) throw new Error('release target must be web');
  return target;
}

export function assertWebArtifactPayload(paths) {
  const entries = new Set(paths);
  const missing = WEB_REQUIRED_ARTIFACT_ENTRIES.filter((path) => !entries.has(path));
  if (missing.length) {
    throw new Error(`release artifact is missing required runtime input: ${missing.join(', ')}`);
  }
  const miniappPath = [...entries].find((path) => path === 'miniapp' || path.startsWith('miniapp/'));
  if (miniappPath) {
    throw new Error(`web release artifact must not contain miniapp payload: ${miniappPath}`);
  }
}

export function assertReleaseSha(value) {
  if (!/^[0-9a-f]{40}$/.test(value ?? '')) {
    throw new Error('release requires a lowercase 40-character Git SHA');
  }
}

export function assertArtifactManifestContract(manifest, expectedGitSha, expectedTarget) {
  if (manifest?.schemaVersion !== ARTIFACT_MANIFEST_SCHEMA_VERSION) {
    throw new Error('artifact manifest schemaVersion must be 2');
  }
  const target = assertWebReleaseTarget(expectedTarget);
  if (manifest.target !== target) {
    throw new Error('artifact manifest target does not match the expected target');
  }
  assertReleaseSha(expectedGitSha);
  assertReleaseSha(manifest.gitSha);
  if (manifest.gitSha !== expectedGitSha) {
    throw new Error('artifact manifest does not match the expected Git SHA');
  }
  if (!manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    throw new Error('artifact manifest files map is required');
  }
  for (const [path, hash] of Object.entries(manifest.files)) {
    const portablePath = typeof path === 'string'
      && path.length > 0
      && !path.startsWith('/')
      && !path.includes('\\')
      && path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
    if (!portablePath) throw new Error(`artifact manifest file path must be portable: ${path}`);
    if (!/^[0-9a-f]{64}$/.test(hash ?? '')) {
      throw new Error(`artifact manifest file hash must be a 64-character SHA-256: ${path}`);
    }
  }
  return manifest;
}
