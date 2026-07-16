import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, refreshWebSession, request, setOnAuthExpired } from './request';
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

  it('does not refresh or retry when a protected request becomes unauthorized after logout', async () => {
    let resolveProtectedResponse!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockReturnValueOnce(new Promise<Response>((resolve) => { resolveProtectedResponse = resolve; }))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'resurrected-access' }))
      .mockResolvedValueOnce(jsonResponse([{ id: 'b1' }]));
    vi.stubGlobal('fetch', fetchMock);

    const pending = request<{ id: string }[]>('/batches');
    clearAccessToken();
    resolveProtectedResponse(jsonResponse({ message: 'expired' }, 401));

    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it('does not expire a newer login when an older refresh fails', async () => {
    const onExpired = vi.fn();
    setOnAuthExpired(onExpired);
    let resolveRefresh!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    })));

    const pendingRefresh = refreshWebSession();
    clearAccessToken();
    setAccessToken('new-login-access');
    resolveRefresh(jsonResponse({ message: 'expired' }, 401));

    await expect(pendingRefresh).resolves.toBeNull();
    expect(getAccessToken()).toBe('new-login-access');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('does not expire a newer login when a stale retry returns 401', async () => {
    const onExpired = vi.fn();
    setOnAuthExpired(onExpired);
    let resolveRetry!: (response: Response) => void;
    let signalRetryStarted!: () => void;
    const retryStarted = new Promise<void>((resolve) => { signalRetryStarted = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'refreshed-access' }))
      .mockImplementationOnce(() => {
        signalRetryStarted();
        return new Promise<Response>((resolve) => { resolveRetry = resolve; });
      });
    vi.stubGlobal('fetch', fetchMock);

    const pendingRequest = request('/batches');
    await retryStarted;
    clearAccessToken();
    setAccessToken('new-login-access');
    resolveRetry(jsonResponse({ message: 'expired' }, 401));

    await expect(pendingRequest).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBe('new-login-access');
    expect(onExpired).not.toHaveBeenCalled();
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
