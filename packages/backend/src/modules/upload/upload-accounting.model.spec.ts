import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildUploadObjectKey, calculateUploadChecksum } from './upload.model';

describe('upload accounting model', () => {
  it('prefixes object keys with the tenant id', () => {
    expect(buildUploadObjectKey({
      tenantId: 'tenant-42',
      purpose: 'farm-record',
      yyyymm: '202607',
      id: '00000000-0000-4000-8000-000000000001',
      ext: 'jpg',
    })).toBe('tenants/tenant-42/farm-records/202607/00000000-0000-4000-8000-000000000001.jpg');
  });

  it('computes a stable SHA-256 checksum', () => {
    const bytes = Buffer.from('durable upload');
    expect(calculateUploadChecksum(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
});
