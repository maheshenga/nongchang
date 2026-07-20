import assert from 'node:assert/strict';
import test from 'node:test';

async function loadPreflight() {
  return import('./server-preflight.mjs');
}

test('DNS preflight requires exactly the configured target address', async () => {
  const { assertDnsTarget } = await loadPreflight();
  assert.doesNotThrow(() => assertDnsTarget(['47.103.96.48'], '47.103.96.48'));
  assert.throws(() => assertDnsTarget([], '47.103.96.48'), /no A records/i);
  assert.throws(() => assertDnsTarget(['47.103.96.48', '1.2.3.4'], '47.103.96.48'), /1\.2\.3\.4/);
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
  assert.doesNotThrow(() => assertCapacity({ freeDiskBytes: 20 * GiB, availableMemoryBytes: 2 * GiB, artifactBytes: 2 * GiB, backupBytes: 3 * GiB }));
  assert.throws(() => assertCapacity({ freeDiskBytes: 9 * GiB, availableMemoryBytes: 2 * GiB, artifactBytes: 1, backupBytes: 1 }), /10 GiB/);
  assert.throws(() => assertCapacity({ freeDiskBytes: 20 * GiB, availableMemoryBytes: 512 * 1024 ** 2, artifactBytes: 1, backupBytes: 1 }), /1 GiB.*memory/i);
  assert.throws(() => assertCapacity({ freeDiskBytes: 12 * GiB, availableMemoryBytes: 2 * GiB, artifactBytes: 2 * GiB, backupBytes: 9 * GiB }), /artifact.*backup/i);
});
