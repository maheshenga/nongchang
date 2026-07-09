import { describe, expect, it } from 'vitest';
import {
  ANTI_FAKE_ALERT_WINDOW_MS,
  ANTI_FAKE_MIN_DISTINCT_IPS,
  ANTI_FAKE_MIN_SCANS,
  buildAlertWindowWhere,
  buildAntiFakeAlertCandidates,
  buildAntiFakeAlerts,
  buildFreezeResponse,
  buildScopedScanWhere,
  buildTraceCodeStatusWhere,
  buildTraceScanItem,
  type ScanRow,
} from './anti-fake.model';

function scan(code: string, ip: string, minute: number): ScanRow {
  return {
    id: `${code}-${ip}-${minute}`,
    code,
    batchId: `b-${code}`,
    ip,
    userAgent: null,
    scannedAt: new Date(`2026-01-01T00:0${minute}:00.000Z`),
  };
}

describe('anti-fake model helpers', () => {
  it('projects scan rows and builds scoped where clauses', () => {
    expect(ANTI_FAKE_ALERT_WINDOW_MS).toBe(3_600_000);
    expect(ANTI_FAKE_MIN_DISTINCT_IPS).toBe(3);
    expect(ANTI_FAKE_MIN_SCANS).toBe(5);

    expect(buildTraceScanItem({
      id: 's1',
      code: 'C1',
      batchId: 'b1',
      ip: '1.1.1.1',
      userAgent: 'ua',
      scannedAt: new Date('2026-06-14T10:00:00.000Z'),
    })).toEqual({
      id: 's1',
      code: 'C1',
      batchId: 'b1',
      ip: '1.1.1.1',
      userAgent: 'ua',
      scannedAt: '2026-06-14T10:00:00.000Z',
    });

    expect(buildScopedScanWhere({ tenantId: 't1', batchIds: ['b1', 'b2'] })).toEqual({
      tenantId: 't1',
      batchId: { in: ['b1', 'b2'] },
    });
  });

  it('builds alert window where without mutating base scope', () => {
    const base = { tenantId: 't1', batchId: { in: ['b1'] } };
    const where = buildAlertWindowWhere(base, Date.parse('2026-01-01T01:00:00.000Z'));

    expect(base).toEqual({ tenantId: 't1', batchId: { in: ['b1'] } });
    expect(where).toEqual({
      tenantId: 't1',
      batchId: { in: ['b1'] },
      scannedAt: { gte: new Date('2026-01-01T00:00:00.000Z') },
    });
  });

  it('groups alert candidates by minimum scan count and distinct IPs', () => {
    const rows = [
      scan('HOT', '1.1.1.1', 1),
      scan('HOT', '2.2.2.2', 2),
      scan('HOT', '3.3.3.3', 3),
      scan('HOT', '1.1.1.1', 4),
      scan('HOT', '2.2.2.2', 5),
      scan('SOLO', '9.9.9.9', 1),
      scan('SOLO', '9.9.9.9', 2),
      scan('SOLO', '9.9.9.9', 3),
      scan('SOLO', '9.9.9.9', 4),
      scan('SOLO', '9.9.9.9', 5),
      scan('LOW', '1.1.1.1', 1),
      scan('LOW', '2.2.2.2', 2),
      scan('LOW', '3.3.3.3', 3),
    ];

    const candidates = buildAntiFakeAlertCandidates(rows);

    expect(candidates.map((candidate) => candidate.code)).toEqual(['HOT']);
    expect(candidates[0].ips).toEqual(new Set(['1.1.1.1', '2.2.2.2', '3.3.3.3']));
    expect(buildTraceCodeStatusWhere('t1', ['HOT'])).toEqual({
      tenantId: 't1',
      code: { in: ['HOT'] },
    });
  });

  it('projects alerts with frozen status and sorts by scan count desc', () => {
    const hot = buildAntiFakeAlertCandidates([
      scan('HOT', '1.1.1.1', 1),
      scan('HOT', '2.2.2.2', 2),
      scan('HOT', '3.3.3.3', 3),
      scan('HOT', '1.1.1.1', 4),
      scan('HOT', '2.2.2.2', 5),
      scan('HOT', '4.4.4.4', 5),
      scan('FRZ', '1.1.1.1', 1),
      scan('FRZ', '2.2.2.2', 2),
      scan('FRZ', '3.3.3.3', 3),
      scan('FRZ', '1.1.1.1', 4),
      scan('FRZ', '2.2.2.2', 5),
    ]);

    const alerts = buildAntiFakeAlerts({
      candidates: hot,
      statuses: [{ code: 'FRZ', status: 'frozen' }, { code: 'HOT', status: 'active' }],
    });

    expect(alerts.map((alert) => alert.code)).toEqual(['HOT', 'FRZ']);
    expect(alerts[0]).toMatchObject({ code: 'HOT', distinctIps: 4, scanCount: 6, frozen: false });
    expect(alerts[0].lastScanAt).toBe('2026-01-01T00:05:00.000Z');
    expect(alerts[1]).toMatchObject({ code: 'FRZ', distinctIps: 3, scanCount: 5, frozen: true });
  });

  it('builds freeze responses from target status', () => {
    expect(buildFreezeResponse('C1', 'frozen')).toEqual({ code: 'C1', frozen: true });
    expect(buildFreezeResponse('C1', 'active')).toEqual({ code: 'C1', frozen: false });
  });
});
