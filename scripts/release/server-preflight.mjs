import { resolve4, resolve6 } from 'node:dns/promises';
import { statfs } from 'node:fs/promises';
import net from 'node:net';
import { freemem } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { assertReleaseSha, assertWebReleaseTarget } from './artifact-contract.mjs';
import { verifyReleaseArtifact } from './verify-artifact.mjs';

const GiB = 1024 ** 3;
const ALLOWED_API_PORTS = new Set([3001, 3002]);

export { assertReleaseSha } from './artifact-contract.mjs';

export function assertDnsTarget(addresses, targetIp) {
  if (!addresses.length) throw new Error('DNS returned no A or AAAA records for the production hostname');
  const unexpected = [...new Set(addresses)].filter((address) => address !== targetIp);
  if (unexpected.length) throw new Error(`DNS does not point exclusively to ${targetIp}; unexpected address record(s): ${unexpected.join(', ')}`);
}

async function resolveRecord(resolveRecordFn, hostname) {
  try {
    return await resolveRecordFn(hostname);
  } catch (error) {
    if (['ENODATA', 'ENOTFOUND', 'ENOTIMP'].includes(error.code)) return [];
    throw error;
  }
}

export async function resolveDnsAddresses(hostname, resolver = { resolve4, resolve6 }) {
  const [ipv4, ipv6] = await Promise.all([resolveRecord(resolver.resolve4, hostname), resolveRecord(resolver.resolve6, hostname)]);
  return [...ipv4, ...ipv6];
}

function matchesDnsName(pattern, hostname) {
  const normalizedPattern = pattern.trim().toLowerCase();
  const normalizedHost = hostname.trim().toLowerCase();
  if (normalizedPattern === normalizedHost) return true;
  if (!normalizedPattern.startsWith('*.')) return false;
  const suffix = normalizedPattern.slice(2);
  return normalizedHost.endsWith(`.${suffix}`) && normalizedHost.split('.').length === suffix.split('.').length + 1;
}

export function assertCertificateNames(names, hostname) {
  if (!names.some((name) => matchesDnsName(name, hostname))) throw new Error(`TLS certificate does not cover ${hostname}; certificate name(s): ${names.join(', ') || 'none'}`);
}

export function assertCertificateValidity(peer, now = new Date()) {
  const validFrom = Date.parse(peer.valid_from);
  const validTo = Date.parse(peer.valid_to);
  if (!Number.isFinite(validFrom) || !Number.isFinite(validTo) || now.getTime() < validFrom || now.getTime() > validTo) throw new Error('TLS certificate is not currently valid');
}

export function assertCandidatePortAvailability({ port, available }) {
  if (!ALLOWED_API_PORTS.has(Number(port))) throw new Error('candidate API port must be 3001 or 3002');
  if (!available) throw new Error(`candidate API port ${port} is already in use`);
}

export function assertCapacity({ freeDiskBytes, availableMemoryBytes, artifactBytes, releaseBytes, backupBytes }) {
  if (availableMemoryBytes < GiB) throw new Error('at least 1 GiB available memory is required before deployment');
  if (freeDiskBytes < 10 * GiB) throw new Error('at least 10 GiB free disk is required before deployment');
  if (freeDiskBytes < artifactBytes + releaseBytes + backupBytes) throw new Error('free disk cannot hold the artifact, extracted release, and new backup');
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') continue;
    const key = argv[index];
    const value = argv[++index];
    if (key === '--hostname') options.hostname = value;
    else if (key === '--target-ip') options.targetIp = value;
    else if (key === '--candidate-port') options.candidatePort = Number(value);
    else if (key === '--archive') options.archive = value;
    else if (key === '--manifest') options.manifestFile = value;
    else if (key === '--release-root') options.releaseRoot = value;
    else if (key === '--backup-bytes') options.backupBytes = Number(value);
    else if (key === '--expected-sha') options.expectedSha = value;
    else if (key === '--expected-target') options.expectedTarget = value;
    else throw new Error(`unknown server preflight argument: ${key}`);
  }
  for (const name of ['hostname', 'targetIp', 'archive', 'manifestFile', 'releaseRoot', 'expectedSha', 'expectedTarget']) {
    if (!options[name]) throw new Error(`--${name.replace('File', '').replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
  }
  for (const name of ['archive', 'manifestFile', 'releaseRoot']) {
    if (!isAbsolute(options[name])) throw new Error(`--${name.replace('File', '').replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} must be absolute`);
    options[name] = resolve(options[name]);
  }
  if (!Number.isSafeInteger(options.backupBytes) || options.backupBytes <= 0) throw new Error('--backup-bytes must be a positive integer');
  assertCandidatePortAvailability({ port: options.candidatePort, available: true });
  assertReleaseSha(options.expectedSha);
  options.expectedTarget = assertWebReleaseTarget(options.expectedTarget);
  options.releaseDir = resolve(options.releaseRoot, 'releases', options.expectedSha);
  return options;
}

function certificateNames(peer) {
  const names = String(peer.subjectaltname ?? '').split(',').map((item) => item.trim()).filter((item) => item.startsWith('DNS:')).map((item) => item.slice(4));
  if (peer.subject?.CN) names.push(peer.subject.CN);
  return [...new Set(names)];
}

function readCertificate(targetIp, hostname) {
  return new Promise((resolveCertificate, reject) => {
    const socket = tls.connect(tlsConnectionOptions(targetIp, hostname));
    socket.setTimeout(10_000);
    socket.once('secureConnect', () => {
      const peer = socket.getPeerCertificate();
      socket.end();
      if (!peer?.raw) reject(new Error('TLS endpoint returned no certificate'));
      else resolveCertificate(peer);
    });
    socket.once('timeout', () => socket.destroy(new Error('TLS certificate check timed out')));
    socket.once('error', reject);
  });
}

export function tlsConnectionOptions(targetIp, hostname) {
  return { host: targetIp, port: 443, servername: hostname, rejectUnauthorized: true };
}

function isPortAvailable(port) {
  return new Promise((resolveAvailability) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolveAvailability(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(() => resolveAvailability(true)));
  });
}

export async function assertCandidateArtifact({ archive, manifestFile, releaseDir, releaseRoot, expectedSha, expectedTarget }) {
  const targetReleaseDir = releaseDir ?? resolve(releaseRoot, 'releases', expectedSha);
  return verifyReleaseArtifact({ archive, manifestFile, releaseDir: targetReleaseDir, expectedGitSha: expectedSha, expectedTarget });
}

export async function runServerPreflight(options) {
  const artifact = await assertCandidateArtifact(options);
  const addresses = await resolveDnsAddresses(options.hostname);
  assertDnsTarget(addresses, options.targetIp);
  const peer = await readCertificate(options.targetIp, options.hostname);
  assertCertificateNames(certificateNames(peer), options.hostname);
  assertCertificateValidity(peer);
  assertCandidatePortAvailability({ port: options.candidatePort, available: await isPortAvailable(options.candidatePort) });
  const filesystem = await statfs(options.releaseRoot ?? options.releaseDir);
  const freeDiskBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
  const availableMemoryBytes = freemem();
  assertCapacity({ freeDiskBytes, availableMemoryBytes, artifactBytes: artifact.archiveBytes, releaseBytes: artifact.releaseBytes, backupBytes: options.backupBytes });
  return { status: 'ok', hostname: options.hostname, targetIp: options.targetIp, candidatePort: options.candidatePort, expectedSha: options.expectedSha, target: artifact.target, freeDiskBytes, availableMemoryBytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runServerPreflight(parseArgs(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`server preflight failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}
