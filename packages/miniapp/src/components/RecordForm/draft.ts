import type { Batch, FarmRecord } from '../../api/farm';

export const RECORD_DRAFT_KEY = 'farm_record_draft_v1';

export interface RecordDraft {
  batchId: string;
  action: string;
  note: string;
  cost: string;
  labor: string;
  images: string[];
  location: string;
  supplyId: string;
  supplyAmount: string;
}

export interface RecordReceiptView {
  recordId: string;
  batchId: string;
  batchNo: string;
  cropName: string;
  action: string;
  recordedAt: string;
}

export function parseRecordDraft(value: unknown): RecordDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const stringKeys: Array<Exclude<keyof RecordDraft, 'images'>> = [
    'batchId', 'action', 'note', 'cost', 'labor', 'location', 'supplyId', 'supplyAmount',
  ];
  if (!stringKeys.every(key => typeof source[key] === 'string')) return null;
  if (!Array.isArray(source.images) || !source.images.every(item => typeof item === 'string')) return null;
  return {
    batchId: source.batchId as string,
    action: source.action as string,
    note: source.note as string,
    cost: source.cost as string,
    labor: source.labor as string,
    images: [...source.images] as string[],
    location: source.location as string,
    supplyId: source.supplyId as string,
    supplyAmount: source.supplyAmount as string,
  };
}

export function isMeaningfulRecordDraft(draft: RecordDraft): boolean {
  return draft.images.length > 0 || [
    draft.action,
    draft.note,
    draft.cost,
    draft.labor,
    draft.location,
    draft.supplyId,
    draft.supplyAmount,
  ].some(value => value.trim().length > 0);
}

export function buildRecordReceipt(record: FarmRecord, batch: Batch, action: string): RecordReceiptView {
  return {
    recordId: record.id,
    batchId: batch.id,
    batchNo: batch.batchNo,
    cropName: batch.cropName,
    action,
    recordedAt: record.recordedAt,
  };
}
