import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useApi } from './useApi';

describe('useApi', () => {
  it('starts loading, then resolves data', async () => {
    const fetcher = vi.fn().mockResolvedValue([{ id: 'a' }]);
    const { result } = renderHook(() => useApi(fetcher));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: 'a' }]);
    expect(result.current.error).toBeNull();
  });

  it('captures error message on rejection', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(result.current.data).toBeNull();
  });

  it('reload re-invokes the fetcher', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce([{ id: 'a' }])
      .mockResolvedValueOnce([{ id: 'b' }]);
    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.reload(); });
    expect(result.current.data).toEqual([{ id: 'b' }]);
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

    const a = renderHook(() => useApi(first));
    await waitFor(() => expect(a.result.current.loading).toBe(false));

    const b = renderHook(() => useApi(second));
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

    const first = renderHook(() => useApi(fetcher, { cacheKey: 'shared-list' }));
    const second = renderHook(() => useApi(fetcher, { cacheKey: 'shared-list' }));

    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { resolve([{ id: 'one-call' }]); });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(first.result.current.data).toEqual([{ id: 'one-call' }]);
    expect(second.result.current.data).toEqual([{ id: 'one-call' }]);
  });
});
