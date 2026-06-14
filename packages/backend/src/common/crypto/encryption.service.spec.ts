import { describe, it, expect } from 'vitest';
import { EncryptionService } from './encryption.service';

const KEY = '0'.repeat(64); // 32 bytes hex
describe('EncryptionService', () => {
  const svc = new EncryptionService(KEY);
  it('round-trips encrypt/decrypt', () => {
    const enc = svc.encrypt('sk-secret-1234');
    expect(enc).not.toContain('sk-secret');
    expect(svc.decrypt(enc)).toBe('sk-secret-1234');
  });
  it('masks secret keeping last 4', () => {
    expect(svc.maskSecret('sk-abcdef1234')).toBe('****1234');
  });
  it('throws on bad key length', () => {
    expect(() => new EncryptionService('short')).toThrow();
  });
});
