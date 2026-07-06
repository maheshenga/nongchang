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

  it('generateCodes rejects blank request keys before sending', async () => {
    expect(() => generateCodes('batch-1', 1, '   ')).toThrow('Missing trace generation request key');

    expect(requestMock).not.toHaveBeenCalled();
  });

  it('createTraceGenerationRequestKey scopes keys by source, batch, and count', () => {
    const key = createTraceGenerationRequestKey('merchant-side-panel', 'batch-1', 5);

    expect(key).toMatch(/^merchant-side-panel:batch-1:5:/);
  });
});
