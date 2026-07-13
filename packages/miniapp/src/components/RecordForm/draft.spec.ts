import { describe, expect, it } from 'vitest';
import type { Batch, FarmRecord } from '../../api/farm';
import { buildRecordReceipt, isMeaningfulRecordDraft, parseRecordDraft, type RecordDraft } from './draft';

const empty: RecordDraft = {
  batchId: 'batch-1', action: '', note: '', cost: '', labor: '', images: [], location: '', supplyId: '', supplyAmount: '',
};

describe('farm record draft', () => {
  it('parses only the non-secret draft shape', () => {
    expect(parseRecordDraft({ ...empty, action: '巡田', images: ['https://oss.test/a.jpg'] })).toEqual({
      ...empty, action: '巡田', images: ['https://oss.test/a.jpg'],
    });
    expect(parseRecordDraft({ ...empty, images: [123] })).toBeNull();
    expect(parseRecordDraft({ batchId: 'batch-1' })).toBeNull();
    expect(parseRecordDraft('secret')).toBeNull();
  });

  it('does not treat an auto-selected batch alone as meaningful input', () => {
    expect(isMeaningfulRecordDraft(empty)).toBe(false);
  });

  it.each([
    ['action', { action: '巡田' }],
    ['note', { note: '叶片正常' }],
    ['cost', { cost: '12' }],
    ['labor', { labor: '0.5' }],
    ['images', { images: ['https://oss.test/a.jpg'] }],
    ['location', { location: '100.1,25.1' }],
    ['supply', { supplyId: 's1', supplyAmount: '2' }],
  ])('treats %s as meaningful input', (_label, patch) => {
    expect(isMeaningfulRecordDraft({ ...empty, ...patch })).toBe(true);
  });

  it('builds a receipt from the real returned record identity', () => {
    const record = { id: 'record-real', recordedAt: '2026-07-13T01:02:03.000Z' } as FarmRecord;
    const batch = { id: 'batch-1', batchNo: 'B-001', cropName: '川贝' } as Batch;
    expect(buildRecordReceipt(record, batch, '巡田')).toEqual({
      recordId: 'record-real', batchId: 'batch-1', batchNo: 'B-001', cropName: '川贝', action: '巡田', recordedAt: record.recordedAt,
    });
  });
});
