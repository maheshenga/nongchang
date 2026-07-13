import Taro from '@tarojs/taro';
import { beforeEach, describe, expect, it } from 'vitest';
import { findIntentBatch, takePendingRecordIntent, writePendingRecordIntent } from './record-intent';

describe('pending farm record intent', () => {
  beforeEach(() => {
    (Taro as any).__reset();
  });

  it('is consumed exactly once', () => {
    writePendingRecordIntent({ id: 'batch-1', batchNo: 'B-001', cropName: '水稻' }, 1_000);

    expect(takePendingRecordIntent(1_500)).toEqual({
      version: 1,
      batchId: 'batch-1',
      batchNo: 'B-001',
      cropName: '水稻',
      createdAt: 1_000,
    });
    expect(takePendingRecordIntent(1_500)).toBeNull();
  });

  it('rejects an intent older than ten minutes', () => {
    writePendingRecordIntent({ id: 'batch-1', batchNo: 'B-001', cropName: '水稻' }, 1_000);

    expect(takePendingRecordIntent(1_000 + 10 * 60_000 + 1)).toBeNull();
  });

  it('rejects malformed or unsupported stored values', () => {
    Taro.setStorageSync('nongchang:pending-record-intent:v1', {
      version: 2,
      batchId: '',
      batchNo: 'B-001',
      cropName: '水稻',
      createdAt: 'yesterday',
    });

    expect(takePendingRecordIntent(2_000)).toBeNull();
  });

  it('resolves only a batch that remains visible to the current user', () => {
    const intent = {
      version: 1 as const,
      batchId: 'batch-2',
      batchNo: 'B-002',
      cropName: '玉米',
      createdAt: 1_000,
    };
    const batches = [{ id: 'batch-1' }, { id: 'batch-2' }];

    expect(findIntentBatch(intent, batches)).toEqual({ id: 'batch-2' });
    expect(findIntentBatch(intent, [{ id: 'batch-1' }])).toBeNull();
  });
});
