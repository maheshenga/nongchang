import type { CreateFarmRecordDto, FarmRecordSource } from '@nongchang/shared';
import type { Batch } from '../../api/farm';

interface BuildFarmRecordPayloadInput {
  batch: Batch;
  action: string;
  note: string;
  cost: string;
  labor: string;
  images: string[];
  location: string;
  source: FarmRecordSource;
  recordedAt: string;
  supplyId: string;
  supplyAmount: string;
}

export function getSupplyAmountError(supplyId: string, supplyAmount: string): string | null {
  if (!supplyId) return null;
  if (!supplyAmount.trim()) return '请输入物料用量';
  const amount = Number(supplyAmount);
  if (!Number.isFinite(amount) || amount <= 0) return '物料用量必须大于 0';
  return null;
}

export function getSupplySelectionUpdate(currentSupplyId: string, nextSupplyId: string) {
  return {
    supplyId: currentSupplyId === nextSupplyId ? '' : nextSupplyId,
    supplyAmount: '',
  };
}

export function buildFarmRecordPayload(input: BuildFarmRecordPayloadInput): CreateFarmRecordDto {
  const detail: Record<string, unknown> = {};
  if (input.note) detail.note = input.note;
  if (input.cost) detail.cost = Number(input.cost) || 0;
  if (input.labor) detail.labor = Number(input.labor) || 0;

  const payload: CreateFarmRecordDto = {
    batchId: input.batch.id,
    fieldId: input.batch.fieldId,
    action: input.action,
    detail: Object.keys(detail).length ? detail : undefined,
    images: input.images.length ? input.images : undefined,
    location: input.location || undefined,
    recordedAt: input.recordedAt,
    source: input.source,
  };

  if (input.supplyId) {
    payload.supplyId = input.supplyId;
    payload.supplyAmount = Number(input.supplyAmount);
  }

  return payload;
}
