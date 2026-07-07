import { BatchStatus } from '@nongchang/shared';
import type { Batch } from '../api/batches';

export interface ViewBatch {
  id: string;
  code: string;
  type: string;
  date: string;
  house: string;
  owner: string;
  stage: string;
  color: string;
  inputCost: number;
  laborCost: number;
  sellPrice: number;
  generated: number;
  scanTotal: number;
}

export interface BatchFilterState {
  searchCode: string;
  filterType: string;
  filterHouse: string;
  filterDateRange: string;
}

export type BatchExportRow = Array<string | number>;
export type BatchStatusTone = 'active' | 'success' | 'warning' | 'neutral' | 'danger';

export const PAGE_SIZE = 10;

const STATUS_COLOR: Record<string, string> = {
  [BatchStatus.PLANTING]: 'cyan',
  [BatchStatus.GROWING]: 'emerald',
  [BatchStatus.HARVESTED]: 'amber',
  [BatchStatus.DISTRIBUTED]: 'indigo',
};

export const STATUS_LABEL: Record<string, string> = {
  [BatchStatus.PLANTING]: '种植中',
  [BatchStatus.GROWING]: '生长中',
  [BatchStatus.HARVESTED]: '已收获',
  [BatchStatus.DISTRIBUTED]: '已分销',
};

export function toViewBatch(batch: Batch): ViewBatch {
  return {
    id: batch.id,
    code: batch.batchNo,
    type: batch.cropName,
    date: batch.plantDate.slice(0, 10),
    house: batch.fieldId.slice(0, 8),
    owner: batch.ownerName ?? '—',
    stage: batch.status,
    color: STATUS_COLOR[batch.status] ?? 'slate',
    inputCost: batch.inputCost,
    laborCost: batch.laborCost,
    sellPrice: batch.sellPrice,
    generated: batch.codeCount,
    scanTotal: batch.scanTotal,
  };
}

export function filterBatches(batches: ViewBatch[], filters: BatchFilterState): ViewBatch[] {
  return batches.filter((batch) => {
    const matchCode = filters.searchCode
      ? batch.code.toLowerCase().includes(filters.searchCode.toLowerCase())
      : true;
    const matchType = filters.filterType === 'all' ? true : batch.type.includes(filters.filterType);
    const matchHouse = filters.filterHouse === 'all' ? true : batch.house.includes(filters.filterHouse);
    let matchDate = true;
    if (filters.filterDateRange === '2024') matchDate = batch.date.startsWith('2024');
    if (filters.filterDateRange === '2023') matchDate = batch.date.startsWith('2023');
    return matchCode && matchType && matchHouse && matchDate;
  });
}

export function paginateBatches(batches: ViewBatch[], page: number, pageSize = PAGE_SIZE): ViewBatch[] {
  return batches.slice((page - 1) * pageSize, page * pageSize);
}

export function marginText(input: number, labor: number, sell: number): string {
  if (sell === 0) return '待分销预测';
  return `${(((sell - (input + labor)) / sell) * 100).toFixed(1)}%`;
}

export function calculateMargin(input: number, labor: number, sell: number): { margin: number; text: string; expectedSell: number } {
  const totalCost = input + labor;
  if (sell === 0) return { margin: 0, text: '待分销预测', expectedSell: totalCost * 1.5 };
  const margin = ((sell - totalCost) / sell) * 100;
  return { margin, text: `${margin.toFixed(1)}%`, expectedSell: sell };
}

export function statusTone(stage: string): BatchStatusTone {
  if (stage === BatchStatus.HARVESTED || stage === BatchStatus.DISTRIBUTED) return 'success';
  if (stage === BatchStatus.GROWING || stage === BatchStatus.PLANTING) return 'active';
  return 'neutral';
}

export function toBatchExportRows(batches: ViewBatch[]): BatchExportRow[] {
  return batches.map((batch) => [
    batch.code,
    batch.type,
    batch.date,
    batch.house,
    batch.owner,
    batch.stage,
    batch.generated,
    batch.scanTotal,
    batch.inputCost,
    batch.laborCost,
    batch.sellPrice,
    marginText(batch.inputCost, batch.laborCost, batch.sellPrice),
  ]);
}
