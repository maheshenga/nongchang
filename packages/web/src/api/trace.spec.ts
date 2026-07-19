import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { createTraceGenerationRequestKey, generateCodes, listEvents } from './trace';

beforeEach(() => requestMock.mockReset().mockResolvedValue([]));

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
});
