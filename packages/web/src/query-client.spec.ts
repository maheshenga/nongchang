import { describe, expect, it } from 'vitest';
import { createAppQueryClient, resetAppQueryCache } from './query-client';

describe('query client session isolation', () => {
  it('clears cached server state when the authenticated identity changes', async () => {
    const client = createAppQueryClient();
    client.setQueryData(['api', 'fields'], [{ id: 'field-1' }]);

    await resetAppQueryCache(client);

    expect(client.getQueryData(['api', 'fields'])).toBeUndefined();
  });
});
