import { describe, it, expect } from 'vitest';
import { countThisMonth, sortByRecentDesc, traceTypeMeta } from './stats';

describe('utils/stats', () => {
  it('countThisMonth counts records in given year-month', () => {
    const recs = [
      { recordedAt: '2026-06-01T08:00:00Z' },
      { recordedAt: '2026-06-20T08:00:00Z' },
      { recordedAt: '2026-05-30T08:00:00Z' },
    ];
    expect(countThisMonth(recs, new Date('2026-06-14T00:00:00Z'))).toBe(2);
  });

  it('countThisMonth handles empty', () => {
    expect(countThisMonth([], new Date('2026-06-14T00:00:00Z'))).toBe(0);
  });

  it('sortByRecentDesc orders newest first', () => {
    const recs = [
      { recordedAt: '2026-06-01T08:00:00Z', id: 'a' },
      { recordedAt: '2026-06-20T08:00:00Z', id: 'b' },
    ];
    expect(sortByRecentDesc(recs).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('traceTypeMeta returns color+label for known type, fallback for unknown', () => {
    expect(traceTypeMeta('origin').label).toBe('产地');
    expect(traceTypeMeta('zzz').label).toBe('其他');
    expect(typeof traceTypeMeta('farm').color).toBe('string');
  });
});
