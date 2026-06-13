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
});
