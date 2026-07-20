import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { WEB_REQUIRED_ARTIFACT_ENTRIES } from './artifact-contract.mjs';

async function loadPreflight() {
  return import('./server-preflight.mjs');
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function tar(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn('tar', args, { windowsHide: true });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolveRun() : reject(new Error(`tar failed with exit code ${code}`)));
  });
}

async function writeArchive(root, gitSha) {
  const payload = join(root, 'payload');
  const files = {};
  const pnpmDirectoryLinks = new Set([
    'node_modules/@prisma/client',
    'node_modules/prisma',
  ]);
  for (const [index, path] of WEB_REQUIRED_ARTIFACT_ENTRIES.entries()) {
    if (pnpmDirectoryLinks.has(path)) continue;
    const content = `payload ${index}`;
    const target = join(payload, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    files[path] = sha256(content);
  }
  const clientStore = join(payload, 'node_modules/.pnpm/@prisma+client/node_modules/@prisma/client');
  const prismaStore = join(payload, 'node_modules/.pnpm/prisma/node_modules/prisma');
  await mkdir(clientStore, { recursive: true });
  await mkdir(prismaStore, { recursive: true });
  await writeFile(join(clientStore, 'package.json'), '{"name":"@prisma/client"}\n');
  await writeFile(join(prismaStore, 'package.json'), '{"name":"prisma"}\n');
  await mkdir(join(payload, 'node_modules/@prisma'), { recursive: true });
  await symlink('../.pnpm/@prisma+client/node_modules/@prisma/client', join(payload, 'node_modules/@prisma/client'), 'dir');
  await symlink('.pnpm/prisma/node_modules/prisma', join(payload, 'node_modules/prisma'), 'dir');
  files['node_modules/@prisma/client'] = sha256('symlink:../.pnpm/@prisma+client/node_modules/@prisma/client');
  files['node_modules/prisma'] = sha256('symlink:.pnpm/prisma/node_modules/prisma');
  files['node_modules/.pnpm/@prisma+client/node_modules/@prisma/client/package.json'] = sha256('{"name":"@prisma/client"}\n');
  files['node_modules/.pnpm/prisma/node_modules/prisma/package.json'] = sha256('{"name":"prisma"}\n');
  const embedded = { schemaVersion: 2, target: 'web', gitSha, provenance: { platform: 'linux', arch: 'x64' }, files };
  await writeFile(join(payload, 'artifact-manifest.json'), JSON.stringify(embedded));
  const archive = join(root, `nongchang-${gitSha}.tar.gz`);
  await tar(['-czf', archive, '-C', payload, '.']);
  const manifestFile = join(root, `nongchang-${gitSha}.manifest.json`);
  await writeFile(manifestFile, JSON.stringify({ ...embedded, archive: `nongchang-${gitSha}.tar.gz`, archiveSha256: sha256(await (await import('node:fs/promises')).readFile(archive)) }));
  return { archive, manifestFile };
}

test('DNS preflight requires exactly the configured target address', async () => {
  const { assertDnsTarget, resolveDnsAddresses } = await loadPreflight();
  assert.deepEqual(await resolveDnsAddresses('farm.qingyouai.com', {
    resolve4: async () => ['47.103.96.48'],
    resolve6: async () => ['2001:db8::1'],
  }), ['47.103.96.48', '2001:db8::1']);
  assert.doesNotThrow(() => assertDnsTarget(['47.103.96.48'], '47.103.96.48'));
  assert.throws(() => assertDnsTarget([], '47.103.96.48'), /no A or AAAA records/i);
  assert.throws(() => assertDnsTarget(['47.103.96.48', '1.2.3.4'], '47.103.96.48'), /1\.2\.3\.4/);
  assert.throws(() => assertDnsTarget(['47.103.96.48', '2001:db8::1'], '47.103.96.48'), /2001:db8::1/);
});

test('TLS preflight validates name coverage and current validity', async () => {
  const { assertCertificateNames, assertCertificateValidity } = await loadPreflight();
  assert.doesNotThrow(() => assertCertificateNames(['*.qingyouai.com'], 'farm.qingyouai.com'));
  assert.throws(() => assertCertificateNames(['fcy.qingyouai.com'], 'farm.qingyouai.com'), /certificate.*farm\.qingyouai\.com/i);
  assert.doesNotThrow(() => assertCertificateValidity({ valid_from: '2026-07-19T00:00:00Z', valid_to: '2026-07-21T00:00:00Z' }, new Date('2026-07-20T00:00:00Z')));
  assert.throws(() => assertCertificateValidity({ valid_from: '2026-07-21T00:00:00Z', valid_to: '2026-07-22T00:00:00Z' }, new Date('2026-07-20T00:00:00Z')), /not currently valid/);
});

test('only ports 3001 and 3002 may be available release candidates', async () => {
  const { assertCandidatePortAvailability } = await loadPreflight();
  assert.doesNotThrow(() => assertCandidatePortAvailability({ port: 3001, available: true }));
  assert.doesNotThrow(() => assertCandidatePortAvailability({ port: 3002, available: true }));
  assert.throws(() => assertCandidatePortAvailability({ port: 3003, available: true }), /3001 or 3002/);
  assert.throws(() => assertCandidatePortAvailability({ port: 3002, available: false }), /already in use/);
});

test('capacity requires one GiB memory, ten GiB disk, and artifact extraction plus backup room', async () => {
  const { assertCapacity } = await loadPreflight();
  const GiB = 1024 ** 3;
  assert.doesNotThrow(() => assertCapacity({ freeDiskBytes: 20 * GiB, availableMemoryBytes: 2 * GiB, artifactBytes: 2 * GiB, releaseBytes: 4 * GiB, backupBytes: 3 * GiB }));
  assert.throws(() => assertCapacity({ freeDiskBytes: 9 * GiB, availableMemoryBytes: 2 * GiB, artifactBytes: 1, releaseBytes: 1, backupBytes: 1 }), /10 GiB/);
  assert.throws(() => assertCapacity({ freeDiskBytes: 20 * GiB, availableMemoryBytes: 512 * 1024 ** 2, artifactBytes: 1, releaseBytes: 1, backupBytes: 1 }), /1 GiB.*memory/i);
  assert.throws(() => assertCapacity({ freeDiskBytes: 12 * GiB, availableMemoryBytes: 2 * GiB, artifactBytes: 2 * GiB, releaseBytes: 9 * GiB, backupBytes: 2 * GiB }), /artifact.*release.*backup/i);
});

test('server preflight CLI resolves immutable artifact inputs and candidate release path', async () => {
  const { parseServerPreflightArgs } = await loadPreflight();
  const root = join(tmpdir(), 'nongchang-preflight-cli');
  const gitSha = '7'.repeat(40);
  const options = parseServerPreflightArgs([
    '--hostname', 'farm.qingyouai.com',
    '--target-ip', '47.103.96.48',
    '--candidate-port', '3002',
    '--archive', join(root, `nongchang-${gitSha}.tar.gz`),
    '--manifest', join(root, `nongchang-${gitSha}.manifest.json`),
    '--release-root', root,
    '--backup-bytes', '1024',
    '--expected-sha', gitSha,
    '--expected-target', 'web',
  ]);
  assert.equal(options.releaseDir, join(root, 'releases', gitSha));
  assert.equal(options.candidatePort, 3002);
  assert.equal(options.expectedTarget, 'web');
});

test('candidate artifact verification extracts and verifies the immutable archive before preflight', { skip: process.platform !== 'linux' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-server-preflight-'));
  try {
    const gitSha = 'd'.repeat(40);
    const artifact = await writeArchive(root, gitSha);
    const releaseDir = join(root, 'releases', gitSha);
    await mkdir(releaseDir, { recursive: true });
    const { assertCandidateArtifact } = await loadPreflight();
    const result = await assertCandidateArtifact({ ...artifact, releaseDir, expectedSha: gitSha, expectedTarget: 'web' });
    assert.equal(result.gitSha, gitSha);
    assert.ok(result.releaseBytes > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function successfulPreflightDependencies({ failDnsOnce = false } = {}) {
  let dnsCalls = 0;
  return {
    assertCandidateArtifact: async ({ releaseDir, onBeforeExtract }) => {
      await onBeforeExtract({ archiveBytes: 10, estimatedReleaseBytes: 20 });
      await mkdir(releaseDir, { recursive: true });
      await writeFile(join(releaseDir, 'candidate-marker'), 'candidate');
      return { archiveBytes: 10, releaseBytes: 20, target: 'web' };
    },
    statfs: async () => ({ bavail: 30 * 1024, bsize: 1024 ** 2 }),
    freemem: () => 2 * 1024 ** 3,
    resolveDnsAddresses: async () => {
      dnsCalls += 1;
      if (failDnsOnce && dnsCalls === 1) throw new Error('transient DNS failure');
      return ['47.103.96.48'];
    },
    readCertificate: async () => ({
      raw: Buffer.from('certificate'),
      subjectaltname: 'DNS:farm.qingyouai.com',
      valid_from: '2026-07-19T00:00:00Z',
      valid_to: '2026-07-21T00:00:00Z',
    }),
    isPortAvailable: async () => true,
  };
}

test('transient post-extraction preflight failure removes owned candidate and retry succeeds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-preflight-retry-'));
  const gitSha = 'f'.repeat(40);
  const releaseDir = join(root, 'releases', gitSha);
  const options = {
    releaseRoot: root,
    releaseDir,
    archive: join(root, `nongchang-${gitSha}.tar.gz`),
    manifestFile: join(root, `nongchang-${gitSha}.manifest.json`),
    expectedSha: gitSha,
    expectedTarget: 'web',
    hostname: 'farm.qingyouai.com',
    targetIp: '47.103.96.48',
    candidatePort: 3002,
    backupBytes: 1024,
  };
  const dependencies = successfulPreflightDependencies({ failDnsOnce: true });
  try {
    const { runServerPreflight } = await loadPreflight();
    await assert.rejects(() => runServerPreflight(options, dependencies), /transient DNS failure/);
    await assert.rejects(() => readFile(join(releaseDir, 'candidate-marker')), /ENOENT/);
    const result = await runServerPreflight(options, dependencies);
    assert.equal(result.status, 'ok');
    assert.equal(await readFile(join(releaseDir, 'candidate-marker'), 'utf8'), 'candidate');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('server preflight never deletes or overwrites a pre-existing candidate path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nongchang-preflight-existing-'));
  const gitSha = '9'.repeat(40);
  const releaseDir = join(root, 'releases', gitSha);
  try {
    await mkdir(releaseDir, { recursive: true });
    await writeFile(join(releaseDir, 'owner-marker'), 'keep');
    const { runServerPreflight } = await loadPreflight();
    await assert.rejects(() => runServerPreflight({
      releaseRoot: root,
      releaseDir,
      expectedSha: gitSha,
      expectedTarget: 'web',
      hostname: 'farm.qingyouai.com',
      targetIp: '47.103.96.48',
      candidatePort: 3002,
      backupBytes: 1024,
    }, successfulPreflightDependencies()), /must not pre-exist/i);
    assert.equal(await readFile(join(releaseDir, 'owner-marker'), 'utf8'), 'keep');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
