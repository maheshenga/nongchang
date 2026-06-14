import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class EncryptionService {
  private key: Buffer;
  constructor(rawKey = process.env.APP_ENCRYPTION_KEY ?? '') {
    const buf = /^[0-9a-fA-F]{64}$/.test(rawKey)
      ? Buffer.from(rawKey, 'hex')
      : Buffer.from(rawKey, 'base64');
    if (buf.length !== 32) throw new Error('APP_ENCRYPTION_KEY 必须为 32 字节(hex64 或 base64)');
    this.key = buf;
  }
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }
  decrypt(payload: string): string {
    const [ivHex, tagHex, dataHex] = payload.split(':');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  }
  maskSecret(plain: string): string {
    return '****' + plain.slice(-4);
  }
}
