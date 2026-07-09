import type { OssConfigView } from '@nongchang/shared';

export interface OssConfigRow {
  id: string;
  tenantId: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecEnc: string;
  baseUrl: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OssCredentials {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  baseUrl: string | null;
}

export function buildOssConfigView(input: {
  row: OssConfigRow;
  accessKeySecretMasked: string;
}): OssConfigView {
  return {
    region: input.row.region,
    bucket: input.row.bucket,
    accessKeyId: input.row.accessKeyId,
    accessKeySecretMasked: input.accessKeySecretMasked,
    baseUrl: input.row.baseUrl ?? null,
    enabled: input.row.enabled,
  };
}

export function buildOssUpsertArgs(input: {
  tenantId: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecEnc: string;
  baseUrl: string | null;
  enabled: boolean;
}) {
  const update: Record<string, unknown> = {
    region: input.region,
    bucket: input.bucket,
    accessKeyId: input.accessKeyId,
    baseUrl: input.baseUrl,
    enabled: input.enabled,
  };
  if (input.accessKeySecEnc) update.accessKeySecEnc = input.accessKeySecEnc;

  return {
    where: { tenantId: input.tenantId },
    create: {
      tenantId: input.tenantId,
      region: input.region,
      bucket: input.bucket,
      accessKeyId: input.accessKeyId,
      accessKeySecEnc: input.accessKeySecEnc,
      baseUrl: input.baseUrl,
      enabled: input.enabled,
    },
    update,
  };
}

export function canUseOssCredentials(row: OssConfigRow | null): row is OssConfigRow & { enabled: true } {
  return !!row?.enabled;
}

export function buildOssCredentials(input: {
  row: OssConfigRow;
  accessKeySecret: string;
}): OssCredentials {
  return {
    region: input.row.region,
    bucket: input.row.bucket,
    accessKeyId: input.row.accessKeyId,
    accessKeySecret: input.accessKeySecret,
    baseUrl: input.row.baseUrl ?? null,
  };
}
