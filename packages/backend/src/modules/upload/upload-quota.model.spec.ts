import { describe, expect, it } from 'vitest';
import {
  UploadQuotaExceededError,
  applyUploadReservation,
  applyUploadRelease,
} from './upload-quota.model';

describe('upload quota counters', () => {
  it('rejects daily and active limit exhaustion with a stable scope', () => {
    expect(() => applyUploadReservation({
      usageDayKey: '2026-07-13', currentDayKey: '2026-07-13',
      dailyBytes: 90n, activeBytes: 10n, sizeBytes: 11n,
      dailyLimitBytes: 100n, activeLimitBytes: 1000n,
    })).toThrow(expect.objectContaining<Partial<UploadQuotaExceededError>>({ scope: 'daily' }));

    expect(() => applyUploadReservation({
      usageDayKey: '2026-07-13', currentDayKey: '2026-07-13',
      dailyBytes: 10n, activeBytes: 95n, sizeBytes: 6n,
      dailyLimitBytes: 1000n, activeLimitBytes: 100n,
    })).toThrow(expect.objectContaining<Partial<UploadQuotaExceededError>>({ scope: 'active' }));
  });

  it('resets daily usage on UTC day rollover while preserving active usage', () => {
    expect(applyUploadReservation({
      usageDayKey: '2026-07-12', currentDayKey: '2026-07-13',
      dailyBytes: 99n, activeBytes: 20n, sizeBytes: 5n,
      dailyLimitBytes: 100n, activeLimitBytes: 100n,
    })).toEqual({ dayKey: '2026-07-13', dailyBytes: 5n, activeBytes: 25n });
  });

  it('releases pending reservations once and leaves terminal assets unchanged', () => {
    expect(applyUploadRelease({
      assetStatus: 'PENDING', assetDayKey: '2026-07-13', usageDayKey: '2026-07-13',
      dailyBytes: 20n, activeBytes: 30n, sizeBytes: 10n,
    })).toEqual({ changed: true, dailyBytes: 10n, activeBytes: 20n });
    expect(applyUploadRelease({
      assetStatus: 'FAILED', assetDayKey: '2026-07-13', usageDayKey: '2026-07-13',
      dailyBytes: 10n, activeBytes: 20n, sizeBytes: 10n,
    })).toEqual({ changed: false, dailyBytes: 10n, activeBytes: 20n });
  });
});
