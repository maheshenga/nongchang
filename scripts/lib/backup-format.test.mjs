import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptBytes,
  encryptBytes,
  parseEncryptionKey,
  selectBackupSetsForRetention,
  sha256Bytes,
} from './backup-format.mjs';

const keyHex = '11'.repeat(32);
const iv = Buffer.from('00112233445566778899aabb', 'hex');

test('AES-256-GCM backup bytes round-trip with a deterministic fixture key and IV', () => {
  const plaintext = Buffer.from('nongchang backup fixture\n');
  const encrypted = encryptBytes(plaintext, parseEncryptionKey(keyHex), iv);
  assert.notDeepEqual(encrypted, plaintext);
  assert.deepEqual(decryptBytes(encrypted, parseEncryptionKey(keyHex)), plaintext);
});

test('AES-256-GCM authentication rejects tampered ciphertext', () => {
  const encrypted = encryptBytes(Buffer.from('sensitive dump'), parseEncryptionKey(keyHex), iv);
  encrypted[encrypted.length - 17] ^= 0xff;
  assert.throws(() => decryptBytes(encrypted, parseEncryptionKey(keyHex)), /authenticate|authentication/i);
});

test('SHA-256 changes when backup bytes change', () => {
  assert.equal(sha256Bytes(Buffer.from('a')).length, 64);
  assert.notEqual(sha256Bytes(Buffer.from('a')), sha256Bytes(Buffer.from('b')));
});

test('retention keeps the newest requested complete backup sets', () => {
  const sets = [
    { timestamp: '20260713T010000Z', files: ['old.dump.enc', 'old.manifest.json', 'old.sha256'] },
    { timestamp: '20260713T030000Z', files: ['new.dump.enc', 'new.manifest.json', 'new.sha256'] },
    { timestamp: '20260713T020000Z', files: ['mid.dump.enc', 'mid.manifest.json', 'mid.sha256'] },
  ];
  assert.deepEqual(selectBackupSetsForRetention(sets, 2), {
    keep: [sets[1], sets[2]],
    remove: [sets[0]],
  });
});

test('backup encryption key must decode to exactly 32 bytes', () => {
  assert.throws(() => parseEncryptionKey('short'), /32 bytes/i);
});
