import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const directory = dirname(fileURLToPath(import.meta.url));
const formSource = readFileSync(join(directory, 'index.tsx'), 'utf8');
const reviewSource = readFileSync(join(directory, 'RecordSubmissionReview.tsx'), 'utf8');
const receiptSource = readFileSync(join(directory, 'RecordReceipt.tsx'), 'utf8');
const batchPageSource = readFileSync(join(directory, '../../pages/batch/index.tsx'), 'utf8');
const workPageSource = readFileSync(join(directory, '../../pages/work/index.tsx'), 'utf8');

describe('RecordForm recovery workflow boundary', () => {
  it('persists a safe draft and reviews before the real mutation', () => {
    expect(formSource).toContain('RECORD_DRAFT_KEY');
    expect(formSource).toContain('RecordSubmissionReview');
    expect(formSource).toContain('核对并提交');
    expect(formSource).not.toContain('提交上报');
    expect(reviewSource).toContain('确认提交');
    expect(reviewSource).toContain('提交失败不会清除本机草稿');
  });

  it('renders a durable receipt with recovery actions and the returned identity', () => {
    expect(formSource).toContain('buildRecordReceipt');
    expect(receiptSource).toContain('记录编号 {receipt.recordId}');
    expect(receiptSource).toContain('查看记录');
    expect(receiptSource).toContain('再记一笔');
  });

  it('consumes the selected batch intent and opens the form for that batch', () => {
    expect(batchPageSource).toContain('writePendingRecordIntent');
    expect(workPageSource).toContain('takePendingRecordIntent');
    expect(workPageSource).toContain('openForBatch(intent.batchId)');
    expect(formSource).toContain('openForBatch(batchId: string)');
  });
});
