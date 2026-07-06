import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { createTraceGenerationRequestKey, generateCodes } from './trace';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('trace api client', () => {
  it('generateCodes sends Idempotency-Key when requestKey is provided', async () => {
    await generateCodes('batch 1', 5, 'req-123');

    expect(requestMock).toHaveBeenCalledWith('/trace/codes/batch%201?count=5', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'req-123' },
    });
  });

  it('generateCodes omits headers when requestKey is not provided', async () => {
    await generateCodes('batch-1', 2);

    expect(requestMock).toHaveBeenCalledWith('/trace/codes/batch-1?count=2', {
      method: 'POST',
    });
  });

  it('createTraceGenerationRequestKey scopes keys by source, batch, and count', () => {
    const key = createTraceGenerationRequestKey('merchant-side-panel', 'batch-1', 5);

    expect(key).toMatch(/^merchant-side-panel:batch-1:5:/);
  });
});
