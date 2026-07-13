import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rename, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

const MAGIC = Buffer.from('NCBK01');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + IV_BYTES;

export function parseEncryptionKey(raw) {
  const value = raw?.trim() ?? '';
  let key;
  if (/^[0-9a-f]{64}$/i.test(value)) key = Buffer.from(value, 'hex');
  else {
    try {
      key = Buffer.from(value, 'base64');
    } catch {
      key = Buffer.alloc(0);
    }
  }
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes');
  return key;
}

export function encryptBytes(plaintext, key, iv = randomBytes(IV_BYTES)) {
  if (iv.length !== IV_BYTES) throw new Error(`backup IV must contain ${IV_BYTES} bytes`);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, iv, ciphertext, cipher.getAuthTag()]);
}

export function decryptBytes(encrypted, key) {
  if (encrypted.length < HEADER_BYTES + TAG_BYTES || !encrypted.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('invalid encrypted backup header');
  }
  const iv = encrypted.subarray(MAGIC.length, HEADER_BYTES);
  const tag = encrypted.subarray(encrypted.length - TAG_BYTES);
  const ciphertext = encrypted.subarray(HEADER_BYTES, encrypted.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function selectBackupSetsForRetention(sets, keepCount) {
  if (!Number.isInteger(keepCount) || keepCount < 1) throw new Error('retention count must be a positive integer');
  const sorted = [...sets].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return { keep: sorted.slice(0, keepCount), remove: sorted.slice(keepCount) };
}

export async function encryptFile(inputPath, outputPath, key) {
  const iv = randomBytes(IV_BYTES);
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  const output = createWriteStream(tempPath, { flags: 'wx', mode: 0o600 });
  output.write(MAGIC);
  output.write(iv);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  try {
    await pipeline(createReadStream(inputPath), cipher, output);
    const handle = await open(tempPath, 'a');
    try {
      await handle.write(cipher.getAuthTag());
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tempPath, outputPath);
  } catch (error) {
    await open(tempPath, 'r').then((handle) => handle.close()).catch(() => undefined);
    throw error;
  }
}

export async function decryptFile(inputPath, outputPath, key) {
  const info = await stat(inputPath);
  if (info.size < HEADER_BYTES + TAG_BYTES) throw new Error('invalid encrypted backup size');
  const input = await open(inputPath, 'r');
  let header;
  let tag;
  try {
    header = Buffer.alloc(HEADER_BYTES);
    tag = Buffer.alloc(TAG_BYTES);
    await input.read(header, 0, HEADER_BYTES, 0);
    await input.read(tag, 0, TAG_BYTES, info.size - TAG_BYTES);
  } finally {
    await input.close();
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('invalid encrypted backup header');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
  decipher.setAuthTag(tag);
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  await pipeline(
    createReadStream(inputPath, { start: HEADER_BYTES, end: info.size - TAG_BYTES - 1 }),
    decipher,
    createWriteStream(tempPath, { flags: 'wx', mode: 0o600 }),
  );
  await rename(tempPath, outputPath);
}
