import { describe, expect, it } from 'vitest';
import {
  buildOssConfigView,
  buildOssCredentials,
  buildOssUpsertArgs,
  canUseOssCredentials,
  type OssConfigRow,
} from './oss-config.model';

describe('oss config model helpers', () => {
  const baseRow: OssConfigRow = {
    id: 'oss1',
    tenantId: 't1',
    region: 'oss-cn-hangzhou',
    bucket: 'farm-bucket',
    accessKeyId: 'AKID',
    accessKeySecEnc: 'ENC(secret)',
    baseUrl: 'https://cdn.example.com',
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  it('projects OSS config views with masked secret supplied by service', () => {
    expect(buildOssConfigView({ row: baseRow, accessKeySecretMasked: '****1234' })).toEqual({
      region: 'oss-cn-hangzhou',
      bucket: 'farm-bucket',
      accessKeyId: 'AKID',
      accessKeySecretMasked: '****1234',
      baseUrl: 'https://cdn.example.com',
      enabled: true,
    });
  });

  it('normalizes missing baseUrl to null in views and credentials', () => {
    const row = { ...baseRow, baseUrl: null };

    expect(buildOssConfigView({ row, accessKeySecretMasked: '****1234' }).baseUrl).toBeNull();
    expect(buildOssCredentials({ row, accessKeySecret: 'plain-secret' }).baseUrl).toBeNull();
  });

  it('builds upsert args with sparse access key secret update', () => {
    expect(buildOssUpsertArgs({
      tenantId: 't1',
      region: 'oss-cn-hangzhou',
      bucket: 'farm-bucket',
      accessKeyId: 'AKID',
      accessKeySecEnc: 'ENC(secret)',
      baseUrl: 'https://cdn.example.com',
      enabled: true,
    })).toEqual({
      where: { tenantId: 't1' },
      create: {
        tenantId: 't1',
        region: 'oss-cn-hangzhou',
        bucket: 'farm-bucket',
        accessKeyId: 'AKID',
        accessKeySecEnc: 'ENC(secret)',
        baseUrl: 'https://cdn.example.com',
        enabled: true,
      },
      update: {
        region: 'oss-cn-hangzhou',
        bucket: 'farm-bucket',
        accessKeyId: 'AKID',
        baseUrl: 'https://cdn.example.com',
        enabled: true,
        accessKeySecEnc: 'ENC(secret)',
      },
    });

    expect(buildOssUpsertArgs({
      tenantId: 't1',
      region: 'oss-cn-shanghai',
      bucket: 'farm-bucket-2',
      accessKeyId: 'AKID2',
      accessKeySecEnc: '',
      baseUrl: null,
      enabled: false,
    })).toEqual({
      where: { tenantId: 't1' },
      create: {
        tenantId: 't1',
        region: 'oss-cn-shanghai',
        bucket: 'farm-bucket-2',
        accessKeyId: 'AKID2',
        accessKeySecEnc: '',
        baseUrl: null,
        enabled: false,
      },
      update: {
        region: 'oss-cn-shanghai',
        bucket: 'farm-bucket-2',
        accessKeyId: 'AKID2',
        baseUrl: null,
        enabled: false,
      },
    });
  });

  it('returns usable credentials only when row is enabled', () => {
    expect(canUseOssCredentials(null)).toBe(false);
    expect(canUseOssCredentials({ ...baseRow, enabled: false })).toBe(false);
    expect(canUseOssCredentials(baseRow)).toBe(true);

    expect(buildOssCredentials({ row: baseRow, accessKeySecret: 'plain-secret' })).toEqual({
      region: 'oss-cn-hangzhou',
      bucket: 'farm-bucket',
      accessKeyId: 'AKID',
      accessKeySecret: 'plain-secret',
      baseUrl: 'https://cdn.example.com',
    });
  });
});
