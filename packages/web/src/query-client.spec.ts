import { describe, expect, it } from 'vitest';
import { ApiError } from './api/request';
import { createAppQueryClient, resetAppQueryCache, shouldRetryQuery } from './query-client';

describe('query client session isolation', () => {
  it('clears cached server state when the authenticated identity changes', async () => {
    const client = createAppQueryClient();
    client.setQueryData(['api', 'fields'], [{ id: 'field-1' }]);

    await resetAppQueryCache(client);

    expect(client.getQueryData(['api', 'fields'])).toBeUndefined();
  });

  it('retries one transient network or HTTP read failure', () => {
    expect(shouldRetryQuery(0, new TypeError('network unavailable'))).toBe(true);
    expect(shouldRetryQuery(0, new ApiError(408, 'timeout'))).toBe(true);
    expect(shouldRetryQuery(0, new ApiError(429, 'rate limited'))).toBe(true);
    expect(shouldRetryQuery(0, new ApiError(503, 'unavailable'))).toBe(true);
  });

  it('does not retry validation, auth, generic, or second failures', () => {
    expect(shouldRetryQuery(0, new ApiError(400, 'invalid'))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(401, 'unauthorized'))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(422, 'invalid'))).toBe(false);
    expect(shouldRetryQuery(0, new Error('application failure'))).toBe(false);
    expect(shouldRetryQuery(1, new TypeError('still offline'))).toBe(false);
    expect(shouldRetryQuery(1, new ApiError(503, 'still unavailable'))).toBe(false);
  });

  it('keeps mutation retries disabled', () => {
    const client = createAppQueryClient();

    expect(client.getDefaultOptions().mutations?.retry).toBe(false);
  });
});
