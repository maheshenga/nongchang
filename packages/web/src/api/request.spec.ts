import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, discoverWebSession, request, setOnAuthExpired } from './request';
import { clearAccessToken, getAccessToken, setAccessToken } from '../auth/token-store';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('request', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAccessToken();
    setAccessToken('old-access');
    setOnAuthExpired(() => undefined);
    vi.restoreAllMocks();
  });

  it('injects the in-memory Bearer token and returns parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: 'b1' }]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(request<{ id: string }[]>('/batches')).resolves.toEqual([{ id: 'b1' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/batches');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer old-access');
    expect(init.credentials).toBe('same-origin');
    expect(localStorage.length).toBe(0);
  });

  it('discovers an anonymous session from 204 without expiring auth state', async () => {
    const onExpired = vi.fn();
    setOnAuthExpired(onExpired);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(discoverWebSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/web/session', {
      method: 'POST',
      credentials: 'same-origin',
    });
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('keeps session-discovery server failures distinct from auth expiry', async () => {
    const onExpired = vi.fn();
    setOnAuthExpired(onExpired);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: '暂时不可用' }, 503)));

    await expect(discoverWebSession()).rejects.toMatchObject({
      status: 503,
      message: '暂时不可用',
    });
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('propagates session-discovery network failures without expiring auth state', async () => {
    const onExpired = vi.fn();
    setOnAuthExpired(onExpired);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network offline')));

    await expect(discoverWebSession()).rejects.toThrow('network offline');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('stores the access token returned by session discovery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ accessToken: 'discovered-access' })));

    await expect(discoverWebSession()).resolves.toBe('discovered-access');
    expect(getAccessToken()).toBe('discovered-access');
  });

  it('on 401 refreshes through the cookie endpoint then retries exactly once', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-access' }))
      .mockResolvedValueOnce(jsonResponse([{ id: 'b1' }]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(request<{ id: string }[]>('/batches')).resolves.toEqual([{ id: 'b1' }]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/web/refresh');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(fetchMock.mock.calls[1][1]).not.toHaveProperty('body');
    expect(getAccessToken()).toBe('new-access');
    expect((fetchMock.mock.calls[2][1].headers as Record<string, string>).Authorization).toBe(
      'Bearer new-access',
    );
    expect(localStorage.length).toBe(0);
  });

  it('when cookie refresh fails, clears memory, calls onAuthExpired, and throws', async () => {
    const onExpired = vi.fn();
    setOnAuthExpired(onExpired);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ message: 'bad' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('/batches')).rejects.toBeInstanceOf(ApiError);
    expect(getAccessToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('expires the session if the post-refresh retry is also unauthorized', async () => {
    const onExpired = vi.fn();
    setOnAuthExpired(onExpired);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-access' }))
      .mockResolvedValueOnce(jsonResponse({ message: 'still unauthorized' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('/batches')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getAccessToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('throws ApiError with the backend message on non-401 errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'validation failed' }, 400)));

    await expect(request('/batches', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      status: 400,
      message: 'validation failed',
    });
  });

  it('returns null on an empty 200 body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));
    await expect(request<unknown>('/integration-configs/wechat')).resolves.toBeNull();
  });

  it('shares one cookie refresh across concurrent 401 responses', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/auth/web/refresh') {
        refreshCalls += 1;
        return Promise.resolve(jsonResponse({ accessToken: 'new-access' }));
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
