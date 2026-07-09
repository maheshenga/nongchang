import type { CreateTraceCredentialInput, TraceCredentialType, TraceCredentialView } from '@nongchang/shared';

export const TRACE_CREDENTIAL_INVALID_URL_MESSAGE = '资质文件 URL 无效';
export const TRACE_CREDENTIAL_NO_TRUSTED_ORIGIN_MESSAGE = 'No trusted storage origin is configured for credential files';
export const TRACE_CREDENTIAL_UNTRUSTED_ORIGIN_MESSAGE = '资质文件 URL 不在可信存储域名内';

export interface CredentialRow {
  id: string;
  batchId: string;
  type: string;
  title: string;
  issuer: string;
  serialNo: string | null;
  issuedAt: Date | null;
  fileUrl: string;
  createdAt: Date;
}

export interface OssConfigRow {
  enabled: boolean;
  baseUrl: string | null;
}

export type TrustedFileUrlValidation =
  | { ok: true }
  | { ok: false; reason: 'invalid-url' | 'missing-trusted-origin' | 'untrusted-origin' };

export function toTraceCredentialView(row: CredentialRow): TraceCredentialView {
  return {
    id: row.id,
    batchId: row.batchId,
    type: row.type as TraceCredentialType,
    title: row.title,
    issuer: row.issuer,
    serialNo: row.serialNo,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    fileUrl: row.fileUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

export function buildTraceCredentialCreateData(input: { tenantId: string; dto: CreateTraceCredentialInput }) {
  return {
    tenantId: input.tenantId,
    batchId: input.dto.batchId,
    type: input.dto.type,
    title: input.dto.title,
    issuer: input.dto.issuer,
    serialNo: input.dto.serialNo ?? null,
    issuedAt: input.dto.issuedAt ? new Date(input.dto.issuedAt) : null,
    fileUrl: input.dto.fileUrl,
  };
}

export function addTrustedOrigin(origins: Set<string>, rawUrl: string | null | undefined): void {
  if (!rawUrl) return;
  try {
    origins.add(new URL(rawUrl).origin);
  } catch {
    // Ignore invalid trusted URL configuration; upload itself will have failed earlier.
  }
}

export function buildTrustedFileOrigins(input: { ossConfig: OssConfigRow | null; envBaseUrl?: string | null }): Set<string> {
  const origins = new Set<string>();
  if (input.ossConfig?.enabled) addTrustedOrigin(origins, input.ossConfig.baseUrl);
  addTrustedOrigin(origins, input.envBaseUrl);
  return origins;
}

export function validateTrustedFileUrl(fileUrl: string, trustedOrigins: ReadonlySet<string>): TrustedFileUrlValidation {
  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
  if (trustedOrigins.size === 0) return { ok: false, reason: 'missing-trusted-origin' };
  if (!trustedOrigins.has(parsed.origin)) return { ok: false, reason: 'untrusted-origin' };
  return { ok: true };
}
