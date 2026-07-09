import { describe, expect, it } from 'vitest';
import {
  DEVIATION_THRESHOLD_DAYS,
  TERMINAL_PHENOLOGY_STATUSES,
  buildBatchDeviation,
  buildExpectedDaysByCrop,
  buildPhenologyCreateData,
  buildPhenologyUpdateData,
  toPhenologyItem,
} from './phenology.model';

const nowMs = new Date('2026-06-15T00:00:00.000Z').getTime();
const daysAgo = (days: number) => new Date(nowMs - days * 86400000);

describe('phenology model helpers', () => {
  it('keeps deviation threshold and terminal statuses stable', () => {
    expect(DEVIATION_THRESHOLD_DAYS).toBe(7);
    expect(TERMINAL_PHENOLOGY_STATUSES.has('Harvested')).toBe(true);
    expect(TERMINAL_PHENOLOGY_STATUSES.has('Distributed')).toBe(true);
  });

  it('projects phenology rows with ISO createdAt', () => {
    expect(toPhenologyItem({
      id: 'p1',
      tenantId: 't1',
      cropName: 'Rice',
      stage: 'Seedling',
      expectedDays: 12,
      sortOrder: 2,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })).toEqual({
      id: 'p1',
      tenantId: 't1',
      cropName: 'Rice',
      stage: 'Seedling',
      expectedDays: 12,
      sortOrder: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('builds create data with tenant id', () => {
    expect(buildPhenologyCreateData({
      tenantId: 't1',
      dto: { cropName: 'Rice', stage: 'Seedling', expectedDays: 12, sortOrder: 2 },
    })).toEqual({ tenantId: 't1', cropName: 'Rice', stage: 'Seedling', expectedDays: 12, sortOrder: 2 });
  });

  it('builds sparse update data while preserving zero values', () => {
    expect(buildPhenologyUpdateData({ expectedDays: 0, sortOrder: 0 })).toEqual({
      stage: undefined,
      expectedDays: 0,
      sortOrder: 0,
    });
    expect(buildPhenologyUpdateData({ stage: 'Flowering' })).toEqual({
      stage: 'Flowering',
      expectedDays: undefined,
      sortOrder: undefined,
    });
  });

  it('aggregates expected days by crop name', () => {
    const totals = buildExpectedDaysByCrop([
      { cropName: 'Rice', expectedDays: 10 },
      { cropName: 'Rice', expectedDays: 20 },
      { cropName: 'Wheat', expectedDays: 15 },
    ]);

    expect(totals.get('Rice')).toBe(30);
    expect(totals.get('Wheat')).toBe(15);
  });

  it('builds alerting deviations when elapsed days exceed baseline by threshold', () => {
    const deviation = buildBatchDeviation(
      { id: 'b1', batchNo: 'B1', cropName: 'Rice', status: 'Growing', plantDate: daysAgo(100) },
      new Map([['Rice', 90]]),
      nowMs,
    );

    expect(deviation).toMatchObject({
      batchId: 'b1',
      batchNo: 'B1',
      cropName: 'Rice',
      status: 'Growing',
      elapsedDays: 100,
      expectedTotalDays: 90,
      deviationDays: 10,
      noBaseline: false,
      alert: true,
    });
    expect(deviation.plantDate).toBe(daysAgo(100).toISOString());
  });

  it('does not alert at or below the deviation threshold', () => {
    const deviation = buildBatchDeviation(
      { id: 'b1', batchNo: 'B1', cropName: 'Rice', status: 'Growing', plantDate: daysAgo(97) },
      new Map([['Rice', 90]]),
      nowMs,
    );

    expect(deviation.deviationDays).toBe(7);
    expect(deviation.alert).toBe(false);
  });

  it('does not alert terminal batches even when deviation is high', () => {
    const baseline = new Map([['Rice', 90]]);
    const harvested = buildBatchDeviation(
      { id: 'b1', batchNo: 'B1', cropName: 'Rice', status: 'Harvested', plantDate: daysAgo(200) },
      baseline,
      nowMs,
    );
    const distributed = buildBatchDeviation(
      { id: 'b2', batchNo: 'B2', cropName: 'Rice', status: 'Distributed', plantDate: daysAgo(200) },
      baseline,
      nowMs,
    );

    expect(harvested.deviationDays).toBe(110);
    expect(harvested.alert).toBe(false);
    expect(distributed.deviationDays).toBe(110);
    expect(distributed.alert).toBe(false);
  });

  it('marks noBaseline when crop phenology is missing', () => {
    const deviation = buildBatchDeviation(
      { id: 'b1', batchNo: 'B1', cropName: 'Unknown', status: 'Growing', plantDate: daysAgo(200) },
      new Map([['Rice', 90]]),
      nowMs,
    );

    expect(deviation.expectedTotalDays).toBeNull();
    expect(deviation.deviationDays).toBeNull();
    expect(deviation.noBaseline).toBe(true);
    expect(deviation.alert).toBe(false);
  });
});
