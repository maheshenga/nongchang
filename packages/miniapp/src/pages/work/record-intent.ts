import Taro from '@tarojs/taro';

export const PENDING_RECORD_INTENT_KEY = 'nongchang:pending-record-intent:v1';
export const PENDING_RECORD_INTENT_MAX_AGE_MS = 10 * 60_000;

export interface PendingRecordIntent {
  version: 1;
  batchId: string;
  batchNo: string;
  cropName: string;
  createdAt: number;
}

interface IntentBatch {
  id: string;
  batchNo: string;
  cropName: string;
}

export function writePendingRecordIntent(batch: IntentBatch, createdAt = Date.now()): void {
  const intent: PendingRecordIntent = {
    version: 1,
    batchId: batch.id,
    batchNo: batch.batchNo,
    cropName: batch.cropName,
    createdAt,
  };
  Taro.setStorageSync(PENDING_RECORD_INTENT_KEY, intent);
}

export function parsePendingRecordIntent(value: unknown, now = Date.now()): PendingRecordIntent | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1
    || typeof candidate.batchId !== 'string'
    || candidate.batchId.trim() === ''
    || typeof candidate.batchNo !== 'string'
    || candidate.batchNo.trim() === ''
    || typeof candidate.cropName !== 'string'
    || candidate.cropName.trim() === ''
    || typeof candidate.createdAt !== 'number'
    || !Number.isFinite(candidate.createdAt)
  ) return null;

  const age = now - candidate.createdAt;
  if (age < 0 || age > PENDING_RECORD_INTENT_MAX_AGE_MS) return null;
  return candidate as unknown as PendingRecordIntent;
}

export function takePendingRecordIntent(now = Date.now()): PendingRecordIntent | null {
  const value: unknown = Taro.getStorageSync(PENDING_RECORD_INTENT_KEY);
  Taro.removeStorageSync(PENDING_RECORD_INTENT_KEY);
  return parsePendingRecordIntent(value, now);
}

export function findIntentBatch<T extends { id: string }>(
  intent: PendingRecordIntent,
  batches: readonly T[],
): T | null {
  return batches.find((batch) => batch.id === intent.batchId) ?? null;
}
