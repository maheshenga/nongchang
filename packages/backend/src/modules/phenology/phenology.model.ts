import type {
  BatchDeviation,
  CreateCropPhenologyDto,
  CropPhenologyItem,
  UpdateCropPhenologyDto,
} from '@nongchang/shared';

export const DEVIATION_THRESHOLD_DAYS = 7;
export const TERMINAL_PHENOLOGY_STATUSES: ReadonlySet<string> = new Set(['Harvested', 'Distributed']);
const DAY_MS = 86400000;

export interface PhenologyRow {
  id: string;
  tenantId: string;
  cropName: string;
  stage: string;
  expectedDays: number;
  sortOrder: number;
  createdAt: Date;
}

export function toPhenologyItem(row: PhenologyRow): CropPhenologyItem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    cropName: row.cropName,
    stage: row.stage,
    expectedDays: row.expectedDays,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

export function buildPhenologyCreateData(input: { tenantId: string; dto: CreateCropPhenologyDto }) {
  return {
    tenantId: input.tenantId,
    cropName: input.dto.cropName,
    stage: input.dto.stage,
    expectedDays: input.dto.expectedDays,
    sortOrder: input.dto.sortOrder,
  };
}

export function buildPhenologyUpdateData(dto: UpdateCropPhenologyDto) {
  return {
    stage: dto.stage ?? undefined,
    expectedDays: dto.expectedDays ?? undefined,
    sortOrder: dto.sortOrder ?? undefined,
  };
}

export function buildExpectedDaysByCrop(rows: Array<{ cropName: string; expectedDays: number }>): Map<string, number> {
  const totalByCrop = new Map<string, number>();
  for (const row of rows) {
    totalByCrop.set(row.cropName, (totalByCrop.get(row.cropName) ?? 0) + row.expectedDays);
  }
  return totalByCrop;
}

export function buildBatchDeviation(batch: any, expectedDaysByCrop: Map<string, number>, nowMs = Date.now()): BatchDeviation {
  const elapsedDays = Math.max(0, Math.floor((nowMs - new Date(batch.plantDate).getTime()) / DAY_MS));
  const expectedTotalDays = expectedDaysByCrop.has(batch.cropName) ? (expectedDaysByCrop.get(batch.cropName) as number) : null;
  const noBaseline = expectedTotalDays == null;
  const deviationDays = noBaseline ? null : elapsedDays - (expectedTotalDays as number);
  const alert = !noBaseline
    && !TERMINAL_PHENOLOGY_STATUSES.has(batch.status)
    && (deviationDays as number) > DEVIATION_THRESHOLD_DAYS;
  return {
    batchId: batch.id,
    batchNo: batch.batchNo,
    cropName: batch.cropName,
    status: batch.status,
    plantDate: new Date(batch.plantDate).toISOString(),
    elapsedDays,
    expectedTotalDays,
    deviationDays,
    noBaseline,
    alert,
  };
}
