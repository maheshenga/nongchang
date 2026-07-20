import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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
  for (const [index, path] of WEB_REQUIRED_ARTIFACT_ENTRIES.entries()) {
    const content = `payload ${index}`;
    const target = join(payload, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    files[path] = sha256(content);
  }
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

test('candidate artifact verification extracts and verifies the immutable archive before preflight', async () => {
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
