import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCandidatePortAvailability,
  assertCapacity,
  assertCertificateNames,
  assertDnsTarget,
  assertReleaseSha,
  tlsConnectionOptions,
} from './server-preflight.mjs';

test('DNS preflight requires the production hostname to resolve only to the target server', () => {
  assert.doesNotThrow(() => assertDnsTarget(['47.103.96.48'], '47.103.96.48'));
  assert.throws(() => assertDnsTarget([], '47.103.96.48'), /DNS.*no A records/i);
  assert.throws(() => assertDnsTarget(['198.18.1.21'], '47.103.96.48'), /198\.18\.1\.21/);
  assert.throws(() => assertDnsTarget(['10.0.0.8'], '47.103.96.48'), /10\.0\.0\.8/);
  assert.throws(() => assertDnsTarget(['47.103.96.48', '1.2.3.4'], '47.103.96.48'), /1\.2\.3\.4/);
});

test('TLS preflight accepts exact or wildcard SANs and rejects another site certificate', () => {
  assert.doesNotThrow(() => assertCertificateNames(['farm.qingyouai.com'], 'farm.qingyouai.com'));
  assert.doesNotThrow(() => assertCertificateNames(['*.qingyouai.com'], 'farm.qingyouai.com'));
  assert.throws(() => assertCertificateNames(['fcy.qingyouai.com'], 'farm.qingyouai.com'), /certificate.*farm\.qingyouai\.com/i);
});

test('TLS preflight validates the public CA chain while connecting directly to the target IP', () => {
  assert.deepEqual(tlsConnectionOptions('47.103.96.48', 'farm.qingyouai.com'), {
    host: '47.103.96.48',
    port: 443,
    servername: 'farm.qingyouai.com',
    rejectUnauthorized: true,
  });
});

test('candidate port and release SHA checks fail closed', () => {
  assert.doesNotThrow(() => assertCandidatePortAvailability({ port: 3002, available: true }));
  assert.throws(() => assertCandidatePortAvailability({ port: 3003, available: true }), /3001 or 3002/);
  assert.throws(() => assertCandidatePortAvailability({ port: 3002, available: false }), /already in use/);
  assert.doesNotThrow(() => assertReleaseSha('a'.repeat(40)));
  assert.throws(() => assertReleaseSha('abc123'), /40-character Git SHA/);
});

test('capacity preflight reserves ten GiB and space for artifact, extraction, and backup', () => {
  const GiB = 1024 ** 3;
  assert.doesNotThrow(() => assertCapacity({
    freeDiskBytes: 20 * GiB,
    availableMemoryBytes: 2 * GiB,
    artifactBytes: 2 * GiB,
    backupBytes: 3 * GiB,
  }));
  assert.throws(() => assertCapacity({
    freeDiskBytes: 9 * GiB,
    availableMemoryBytes: 2 * GiB,
    artifactBytes: 1,
    backupBytes: 1,
  }), /10 GiB/);
  assert.throws(() => assertCapacity({
    freeDiskBytes: 12 * GiB,
    availableMemoryBytes: 2 * GiB,
    artifactBytes: 2 * GiB,
    backupBytes: 9 * GiB,
  }), /artifact.*backup/i);
  assert.throws(() => assertCapacity({
    freeDiskBytes: 20 * GiB,
    availableMemoryBytes: 512 * 1024 ** 2,
    artifactBytes: 1,
    backupBytes: 1,
  }), /1 GiB.*memory/i);
});
