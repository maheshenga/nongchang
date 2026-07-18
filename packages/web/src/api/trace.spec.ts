import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
const requestFileMock = vi.fn();
vi.mock('./request', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
  request: (...args: unknown[]) => requestMock(...args),
  requestFile: (...args: unknown[]) => requestFileMock(...args),
}));

import {
  createTraceGenerationRequestKey,
  createTraceLabelPdf,
  generateCodes,
  listEvents,
} from './trace';

beforeEach(() => {
  requestMock.mockReset().mockResolvedValue([]);
  requestFileMock.mockReset().mockResolvedValue({
    blob: new Blob(['%PDF-test'], { type: 'application/pdf' }),
    fileName: 'trace-labels-BATCH-001.pdf',
  });
});

describe('trace api client', () => {
  it('generateCodes sends Idempotency-Key when requestKey is provided', async () => {
    await generateCodes('batch 1', 5, 'req-123');

    expect(requestMock).toHaveBeenCalledWith('/trace/codes/batch%201?count=5', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'req-123' },
    });
  });

  it('generateCodes rejects blank request keys before sending', async () => {
    await expect(generateCodes('batch-1', 1, '   ')).rejects.toThrow('Missing trace generation request key');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('createTraceGenerationRequestKey scopes keys by source, batch, and count', () => {
    const key = createTraceGenerationRequestKey('merchant-side-panel', 'batch-1', 5);
    expect(key).toMatch(/^merchant-side-panel:batch-1:5:/);
  });

  it('rejects malformed trace event responses', async () => {
    requestMock.mockResolvedValue([{
      tenantId: 'tenant-1', batchId: 'batch-1', type: 'farm', title: 'Fertilize',
      actor: 'Operator', location: 'Field A', occurredAt: '2026-07-13T00:00:00.000Z',
      payload: null, createdAt: '2026-07-13T00:00:00.000Z',
    }]);
    await expect(listEvents('batch-1')).rejects.toThrow();
  });

  it('requests a real label PDF with an encoded batch ID and optional code selection', async () => {
    const input = {
      paperSize: 'A4' as const,
      codeIds: ['00000000-0000-4000-8000-000000000001'],
    };

    const file = await createTraceLabelPdf('batch 1', input);

    expect(requestFileMock).toHaveBeenCalledWith('/trace/codes/batch%201/labels.pdf', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    expect(file.fileName).toBe('trace-labels-BATCH-001.pdf');
  });

  it('omits codeIds to request all generated codes in the batch', async () => {
    await createTraceLabelPdf('batch-1', { paperSize: '4x6' });
    expect(JSON.parse(requestFileMock.mock.calls[0][1].body)).toEqual({ paperSize: '4x6' });
  });

  it('rejects a successful response that is not a non-empty PDF', async () => {
    requestFileMock.mockResolvedValueOnce({
      blob: new Blob(['<html>error</html>'], { type: 'text/html' }),
      fileName: 'labels.pdf',
    });
    await expect(createTraceLabelPdf('batch-1', {})).rejects.toMatchObject({ status: 502 });

    requestFileMock.mockResolvedValueOnce({
      blob: new Blob(['NOT-PDF'], { type: 'application/pdf' }),
      fileName: 'labels.pdf',
    });
    await expect(createTraceLabelPdf('batch-1', {})).rejects.toMatchObject({ status: 502 });
  });
});
