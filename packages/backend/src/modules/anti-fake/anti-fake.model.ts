import type { AntiFakeAlert, FreezeResponse, TraceScanItem } from '@nongchang/shared';
import { BadRequestException } from '@nestjs/common';

export const ANTI_FAKE_ALERT_WINDOW_MS = 3_600_000;
export const ANTI_FAKE_MIN_DISTINCT_IPS = 3;
export const ANTI_FAKE_MIN_SCANS = 5;

export interface AntiFakeAlertQuery {
  windowMinutes: number;
  minScans: number;
  minDistinctIps: number;
  limit: number;
  now: Date;
}

export type AntiFakeAlertQueryInput = Omit<Partial<AntiFakeAlertQuery>,
  'windowMinutes' | 'minScans' | 'minDistinctIps' | 'limit' | 'now'> & {
  windowMinutes?: number | string;
  minScans?: number | string;
  minDistinctIps?: number | string;
  limit?: number | string;
  now?: Date;
};

function boundedInteger(value: number | string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new BadRequestException(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

export function normalizeAntiFakeAlertQuery(input: AntiFakeAlertQueryInput = {}): AntiFakeAlertQuery {
  return {
    windowMinutes: boundedInteger(input.windowMinutes, 60, 1, 1_440, 'windowMinutes'),
    minScans: boundedInteger(input.minScans, ANTI_FAKE_MIN_SCANS, 1, 10_000, 'minScans'),
    minDistinctIps: boundedInteger(input.minDistinctIps, ANTI_FAKE_MIN_DISTINCT_IPS, 1, 1_000, 'minDistinctIps'),
    limit: boundedInteger(input.limit, 50, 1, 200, 'limit'),
    now: input.now ?? new Date(),
  };
}

export interface ScanRow {
  id: string;
  code: string;
  batchId: string;
  ip: string;
  userAgent: string | null;
  scannedAt: Date;
}

export interface TraceCodeStatusRow {
  code: string;
  status: string;
}

type NonEmptyScanRows = [ScanRow, ...ScanRow[]];

export interface AntiFakeAlertCandidate {
  code: string;
  list: NonEmptyScanRows;
  ips: Set<string>;
}

export function buildTraceScanItem(row: ScanRow): TraceScanItem {
  return {
    id: row.id,
    code: row.code,
    batchId: row.batchId,
    ip: row.ip,
    userAgent: row.userAgent,
    scannedAt: row.scannedAt.toISOString(),
  };
}

export function buildScopedScanWhere(input: { tenantId: string; batchIds: string[] }): Record<string, unknown> {
  return { tenantId: input.tenantId, batchId: { in: input.batchIds } };
}

export function buildAlertWindowWhere(baseWhere: Record<string, unknown>, nowMs: number): Record<string, unknown> {
  return { ...baseWhere, scannedAt: { gte: new Date(nowMs - ANTI_FAKE_ALERT_WINDOW_MS) } };
}

export function buildAntiFakeAlertCandidates(rows: ScanRow[]): AntiFakeAlertCandidate[] {
  const byCode = new Map<string, ScanRow[]>();
  for (const row of rows) {
    const list = byCode.get(row.code) ?? [];
    list.push(row);
    byCode.set(row.code, list);
  }

  const candidates: AntiFakeAlertCandidate[] = [];
  for (const [code, list] of byCode) {
    const ips = new Set(list.map((row) => row.ip));
    if (ips.size < ANTI_FAKE_MIN_DISTINCT_IPS || list.length < ANTI_FAKE_MIN_SCANS) continue;
    candidates.push({ code, list: list as NonEmptyScanRows, ips });
  }
  return candidates;
}

export function buildTraceCodeStatusWhere(tenantId: string, codes: string[]) {
  return { tenantId, code: { in: codes } };
}

export function buildAntiFakeAlerts(input: {
  candidates: AntiFakeAlertCandidate[];
  statuses: TraceCodeStatusRow[];
}): AntiFakeAlert[] {
  const statusByCode = new Map(input.statuses.map((row) => [row.code, row.status]));
  const alerts = input.candidates.map(({ code, list, ips }) => {
    const last = list.reduce((a, b) => (a.scannedAt > b.scannedAt ? a : b));
    return {
      code,
      batchId: list[0].batchId,
      distinctIps: ips.size,
      scanCount: list.length,
      locations: [...ips],
      lastScanAt: last.scannedAt.toISOString(),
      frozen: statusByCode.get(code) === 'frozen',
    };
  });
  return alerts.sort((a, b) => b.scanCount - a.scanCount);
}

export function buildFreezeResponse(code: string, status: 'frozen' | 'active'): FreezeResponse {
  return { code, frozen: status === 'frozen' };
}
