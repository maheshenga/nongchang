import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BatchStatus } from '@nongchang/shared';
import {
  PAGE_SIZE,
  calculateMargin,
  filterBatches,
  marginText,
  paginateBatches,
  statusTone,
  toBatchExportRows,
  toViewBatch,
  type ViewBatch,
} from './BatchAdmin.model';
import type { Batch } from '../api/batches';

const rawBatch = (overrides: Partial<Batch> = {}): Batch => ({
  id: 'batch-1',
  tenantId: 'tenant-1',
  ownerId: 'owner-1',
  ownerName: null,
  fieldId: 'field-alpha-001',
  batchNo: 'B20240520001',
  cropName: '阳光玫瑰',
  plantDate: '2024-05-20T09:15:00.000Z',
  expectedHarvest: '2024-07-01T00:00:00.000Z',
  status: BatchStatus.GROWING,
  createdAt: '2024-05-20T09:15:00.000Z',
  laborCost: 1200,
  sellPrice: 5000,
  codeCount: 10000,
  scanTotal: 2345,
  inputCost: 800,
  ...overrides,
});

const viewBatch = (overrides: Partial<ViewBatch> = {}): ViewBatch => ({
  id: 'batch-1',
  code: 'B20240520001',
  type: '阳光玫瑰',
  date: '2024-05-20',
  house: 'field-al',
  owner: '张三农场',
  stage: BatchStatus.GROWING,
  color: 'emerald',
  inputCost: 800,
  laborCost: 1200,
  sellPrice: 5000,
  generated: 10000,
  scanTotal: 2345,
  ...overrides,
});

describe('BatchAdmin model helpers', () => {
  it('maps API batches into the exact view model consumed by the table', () => {
    expect(toViewBatch(rawBatch())).toEqual({
      id: 'batch-1',
      code: 'B20240520001',
      type: '阳光玫瑰',
      date: '2024-05-20',
      house: 'field-al',
      owner: '—',
      stage: BatchStatus.GROWING,
      color: 'emerald',
      inputCost: 800,
      laborCost: 1200,
      sellPrice: 5000,
      generated: 10000,
      scanTotal: 2345,
    });
  });

  it('filters by batch code case-insensitively plus type, field short code, and year', () => {
    const batches = [
      viewBatch({ id: 'batch-1', code: 'B20240520001', type: '阳光玫瑰', house: 'field-al', date: '2024-05-20' }),
      viewBatch({ id: 'batch-2', code: 'B20230518003', type: '美早', house: 'field-br', date: '2023-05-18' }),
      viewBatch({ id: 'batch-3', code: 'C20240518003', type: '美早', house: 'field-al', date: '2024-05-18' }),
    ];

    expect(filterBatches(batches, {
      searchCode: 'b2024',
      filterType: '阳光',
      filterHouse: 'field-al',
      filterDateRange: '2024',
    }).map((batch) => batch.id)).toEqual(['batch-1']);
  });

  it('paginates with the BatchAdmin page size and keeps empty pages stable', () => {
    const batches = Array.from({ length: PAGE_SIZE + 2 }, (_, index) => viewBatch({ id: `batch-${index + 1}` }));

    expect(paginateBatches(batches, 1).map((batch) => batch.id)).toHaveLength(PAGE_SIZE);
    expect(paginateBatches(batches, 2).map((batch) => batch.id)).toEqual(['batch-11', 'batch-12']);
    expect(paginateBatches(batches, 9)).toEqual([]);
  });

  it('calculates margin copy for sold and unsold batches', () => {
    expect(marginText(800, 1200, 5000)).toBe('60.0%');
    expect(calculateMargin(800, 1200, 5000)).toEqual({ margin: 60, text: '60.0%', expectedSell: 5000 });
    expect(marginText(800, 1200, 0)).toBe('待分销预测');
    expect(calculateMargin(800, 1200, 0)).toEqual({ margin: 0, text: '待分销预测', expectedSell: 3000 });
  });

  it('maps known batch stages to Fluent status tones', () => {
    expect(statusTone(BatchStatus.GROWING)).toBe('active');
    expect(statusTone(BatchStatus.PLANTING)).toBe('active');
    expect(statusTone(BatchStatus.HARVESTED)).toBe('success');
    expect(statusTone(BatchStatus.DISTRIBUTED)).toBe('success');
    expect(statusTone('future-stage')).toBe('neutral');
  });

  it('builds CSV export rows with the existing column order', () => {
    expect(toBatchExportRows([viewBatch()])).toEqual([[
      'B20240520001',
      '阳光玫瑰',
      '2024-05-20',
      'field-al',
      '张三农场',
      BatchStatus.GROWING,
      10000,
      2345,
      800,
      1200,
      5000,
      '60.0%',
    ]]);
  });
});
it('keeps BatchAdmin pure batch helpers outside the rendered component file', () => {
  const source = readFileSync(resolve(__dirname, 'BatchAdmin.tsx'), 'utf8');

  expect(source).toContain("from './BatchAdmin.model'");
  expect(source).not.toContain('function toViewBatch');
  expect(source).not.toContain('const STATUS_LABEL');
  expect(source).not.toContain('const PAGE_SIZE = 10');
  expect(source).not.toContain('const marginText =');
  expect(source).not.toContain('const calculateMargin =');
  expect(source).not.toContain('const statusTone =');
});
