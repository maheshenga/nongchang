import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useApi } from './useApi';
import { queryClient } from '../query-client';

function createWrapper(client: QueryClient = queryClient) {
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
}

beforeEach(() => queryClient.clear());

describe('useApi', () => {
  it('starts loading, then resolves data', async () => {
    const fetcher = vi.fn().mockResolvedValue([{ id: 'a' }]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useApi(fetcher), { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: 'a' }]);
    expect(result.current.error).toBeNull();
  });

  it('captures error message on rejection', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useApi(fetcher), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(result.current.data).toBeNull();
  });

  it('reload re-invokes the fetcher', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce([{ id: 'a' }])
      .mockResolvedValueOnce([{ id: 'b' }]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useApi(fetcher), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.reload(); });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'b' }]));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not share cache for same-named fetchers without an explicit cacheKey', async () => {
    const makeFetcher = (value: string) => Object.defineProperty(
      vi.fn().mockResolvedValue([{ id: value }]),
      'name',
      { value: 'listMerchants' },
    );
    const first = makeFetcher('agents');
    const second = makeFetcher('users');

    const { wrapper } = createWrapper();
    const a = renderHook(() => useApi(first), { wrapper });
    await waitFor(() => expect(a.result.current.loading).toBe(false));

    const b = renderHook(() => useApi(second), { wrapper });
    await waitFor(() => expect(b.result.current.loading).toBe(false));

    expect(a.result.current.data).toEqual([{ id: 'agents' }]);
    expect(b.result.current.data).toEqual([{ id: 'users' }]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('deduplicates in-flight requests when cacheKey is explicit', async () => {
    let resolve!: (value: { id: string }[]) => void;
    const promise = new Promise<{ id: string }[]>((r) => { resolve = r; });
    const fetcher = vi.fn().mockReturnValue(promise);

    const { client, wrapper } = createWrapper();
    const first = renderHook(() => useApi(fetcher, { cacheKey: 'shared-list' }), { wrapper });
    const second = renderHook(() => useApi(fetcher, { cacheKey: 'shared-list' }), { wrapper });

    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { resolve([{ id: 'one-call' }]); });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(first.result.current.data).toEqual([{ id: 'one-call' }]);
    expect(second.result.current.data).toEqual([{ id: 'one-call' }]);
    expect(client.getQueryData(['api', 'shared-list'])).toEqual([{ id: 'one-call' }]);
  });
});
