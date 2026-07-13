import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
const fetchMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { createTraceGenerationRequestKey, fetchPublicTrace, generateCodes, listEvents, TraceLookupError } from './trace';

beforeEach(() => {
  requestMock.mockReset().mockResolvedValue([]);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
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

  it('distinguishes a missing public trace from network failures', async () => {
    fetchMock.mockResolvedValueOnce({ status: 404, ok: false });
    await expect(fetchPublicTrace(' ORC-X ')).rejects.toMatchObject({ kind: 'not-found' });
    expect(fetchMock).toHaveBeenCalledWith('/api/public/trace/ORC-X');

    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(fetchPublicTrace('ORC-X')).rejects.toEqual(expect.objectContaining({
      name: 'TraceLookupError',
      kind: 'network',
    }));
  });

  it('uses the typed lookup error contract', () => {
    const error = new TraceLookupError('network', '网络错误');
    expect(error.kind).toBe('network');
    expect(error.name).toBe('TraceLookupError');
  });
});
