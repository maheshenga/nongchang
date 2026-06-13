import { describe, it, expect, beforeEach, vi } from 'vitest';
import { request, ApiError, setOnAuthExpired } from './request';
import { setTokens, getTokens } from '../auth/token-store';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

describe('request', () => {
  beforeEach(() => {
    localStorage.clear();
    setTokens({ accessToken: 'old-access', refreshToken: 'good-refresh' });
    vi.restoreAllMocks();
  });

  it('injects Bearer token and returns parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: 'b1' }]));
    vi.stubGlobal('fetch', fetchMock);
    const data = await request<{ id: string }[]>('/batches');
    expect(data).toEqual([{ id: 'b1' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/batches');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer old-access');
  });

  it('on 401 refreshes then retries once and succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' }))
      .mockResolvedValueOnce(jsonResponse([{ id: 'b1' }]));
    vi.stubGlobal('fetch', fetchMock);
    const data = await request<{ id: string }[]>('/batches');
    expect(data).toEqual([{ id: 'b1' }]);
    expect(getTokens()?.accessToken).toBe('new-access');
    const retryInit = fetchMock.mock.calls[2][1];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer new-access');
  });

  it('when refresh also 401, clears tokens, calls onAuthExpired, throws', async () => {
    const onExpired = vi.fn();
    setOnAuthExpired(onExpired);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ message: 'bad' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('/batches')).rejects.toBeInstanceOf(ApiError);
    expect(getTokens()).toBeNull();
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('throws ApiError with backend message on non-401 error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: '字段校验失败' }, 400));
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('/batches', { method: 'POST', body: '{}' }))
      .rejects.toMatchObject({ status: 400, message: '字段校验失败' });
  });

  it('concurrent 401s share a single refresh call', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/auth/refresh') {
        refreshCalls++;
        return Promise.resolve(jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' }));
      }
      return Promise.resolve(jsonResponse([], 200));
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([request('/batches'), request('/fields')]);
    expect(refreshCalls).toBe(1);
  });
});
