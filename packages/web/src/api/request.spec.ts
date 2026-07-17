import { describe, it, expect, beforeEach, vi } from 'vitest';
import { request, requestFile, ApiError, refreshWebSession, setOnAuthExpired } from './request';
import { clearAccessToken, getAccessToken, setAccessToken } from '../auth/token-store';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

describe('request', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAccessToken();
    setAccessToken('old-access');
    setOnAuthExpired(() => {});
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

  it('on 401 refreshes from the HttpOnly cookie then retries once and succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-access' }))
      .mockResolvedValueOnce(jsonResponse([{ id: 'b1' }]));
    vi.stubGlobal('fetch', fetchMock);
    const data = await request<{ id: string }[]>('/batches');
    expect(data).toEqual([{ id: 'b1' }]);
    expect(getAccessToken()).toBe('new-access');
    expect(fetchMock.mock.calls[1]).toEqual(['/api/auth/web/refresh', {
      method: 'POST',
      credentials: 'same-origin',
    }]);
    const retryInit = fetchMock.mock.calls[2][1];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer new-access');
    expect(localStorage.length).toBe(0);
  });

  it('when cookie refresh also 401, clears the in-memory token, calls onAuthExpired, and throws', async () => {
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

  it('expires the local session when the single retried request is still unauthorized', async () => {
    const onExpired = vi.fn();
    setOnAuthExpired(onExpired);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-access' }))
      .mockResolvedValueOnce(jsonResponse({ message: 'revoked' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('/batches')).rejects.toBeInstanceOf(ApiError);
    expect(getAccessToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('does not restore access after logout invalidates an in-flight cookie refresh', async () => {
    let resolveRefresh!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { resolveRefresh = resolve; }));
    vi.stubGlobal('fetch', fetchMock);

    const refresh = refreshWebSession();
    clearAccessToken();
    resolveRefresh(jsonResponse({ accessToken: 'stale-access' }));

    await expect(refresh).resolves.toBeNull();
    expect(getAccessToken()).toBeNull();
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

  it('throws ApiError with backend message on non-401 error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: '字段校验失败' }, 400));
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('/batches', { method: 'POST', body: '{}' }))
      .rejects.toMatchObject({ status: 400, message: '字段校验失败' });
  });

  it('returns null on empty 200 body (后端返回 null/Content-Length:0)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const data = await request<unknown>('/integration-configs/wechat');
    expect(data).toBeNull();
  });

  it('concurrent 401s share a single cookie refresh call', async () => {
    let refreshCalls = 0;
    let expiredRequests = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/auth/web/refresh') {
        refreshCalls++;
        return Promise.resolve(jsonResponse({ accessToken: 'new-access' }));
      }
      if (expiredRequests++ < 2) return Promise.resolve(jsonResponse({ message: 'expired' }, 401));
      return Promise.resolve(jsonResponse([], 200));
    });
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([request('/batches'), request('/fields')]);
    expect(refreshCalls).toBe(1);
  });

  it('returns an authenticated PDF Blob and decodes an RFC 5987 filename', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('%PDF-test', {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': "attachment; filename*=UTF-8''trace-labels-BATCH%20001.pdf",
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const file = await requestFile('/trace/codes/batch-1/labels.pdf', { method: 'POST', body: '{}' });

    expect(file.blob.type).toBe('application/pdf');
    expect(await file.blob.text()).toBe('%PDF-test');
    expect(file.fileName).toBe('trace-labels-BATCH 001.pdf');
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization)
      .toBe('Bearer old-access');
  });

  it('refreshes a file request once and returns the retried binary response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-access' }))
      .mockResolvedValueOnce(new Response('%PDF-retried', {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const file = await requestFile('/trace/codes/batch-1/labels.pdf');

    expect(await file.blob.text()).toBe('%PDF-retried');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[2][1].headers as Record<string, string>).Authorization)
      .toBe('Bearer new-access');
  });

  it('parses backend JSON errors before consuming a file body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'PDF 中文字体不可用' }, 503)));

    await expect(requestFile('/trace/codes/batch-1/labels.pdf'))
      .rejects.toMatchObject({ status: 503, message: 'PDF 中文字体不可用' });
  });

  it('keeps only a safe basename from encoded content disposition paths', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('%PDF-test', {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': "attachment; filename*=UTF-8''..%2F..%2Fevil%0D%0A.pdf",
      },
    })));

    await expect(requestFile('/trace/codes/batch-1/labels.pdf'))
      .resolves.toMatchObject({ fileName: 'evil.pdf' });
  });

  it('shares one refresh between concurrent JSON and file requests', async () => {
    let protectedCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/auth/web/refresh') {
        refreshCalls += 1;
        return Promise.resolve(jsonResponse({ accessToken: 'new-access' }));
      }
      if (protectedCalls++ < 2) return Promise.resolve(jsonResponse({ message: 'expired' }, 401));
      if (url.endsWith('/labels.pdf')) {
        return Promise.resolve(new Response('%PDF-test', { headers: { 'Content-Type': 'application/pdf' } }));
      }
      return Promise.resolve(jsonResponse([]));
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      request('/batches'),
      requestFile('/trace/codes/batch-1/labels.pdf'),
    ]);

    expect(refreshCalls).toBe(1);
  });
});
