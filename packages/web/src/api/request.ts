import type { WebAccessTokenResponse } from '@nongchang/shared';
import { clearAccessToken, getAccessToken, setAccessToken } from '../auth/token-store';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onAuthExpired: (() => void) | null = null;

export function setOnAuthExpired(cb: () => void): void {
  onAuthExpired = cb;
}

function expireWebSession(): void {
  clearAccessToken();
  onAuthExpired?.();
}

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch('/api/auth/web/refresh', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {
    expireWebSession();
    return null;
  }

  if (!response.ok) {
    expireWebSession();
    return null;
  }

  try {
    const body = (await response.json()) as WebAccessTokenResponse;
    if (!body.accessToken) throw new Error('Missing access token');
    setAccessToken(body.accessToken);
    return body.accessToken;
  } catch {
    expireWebSession();
    return null;
  }
}

export function refreshWebSession(): Promise<string | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function discoverWebSession(): Promise<string | null> {
  const response = await fetch('/api/auth/web/session', {
    method: 'POST',
    credentials: 'same-origin',
  });

  if (response.status === 204) {
    clearAccessToken();
    return null;
  }
  if (!response.ok) throw await parseError(response);

  let body: WebAccessTokenResponse;
  try {
    body = (await response.json()) as WebAccessTokenResponse;
  } catch {
    throw new ApiError(response.status, '会话发现响应无效');
  }
  if (!body.accessToken) throw new ApiError(response.status, '会话发现响应无效');
  setAccessToken(body.accessToken);
  return body.accessToken;
}

async function parseError(response: Response): Promise<ApiError> {
  let message = `请求失败 (${response.status})`;
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) message = body.message.join('; ');
    else if (body.message) message = body.message;
  } catch {
    // Keep the status-based fallback when the response is not JSON.
  }
  return new ApiError(response.status, message);
}

async function send(path: string, init: RequestInit, accessToken: string | null): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (
    init.body
    && !(init.body instanceof FormData)
    && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')
  ) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers,
  });
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await send(path, init, getAccessToken());

  if (response.status === 401) {
    const newAccessToken = await refreshWebSession();
    if (!newAccessToken) throw await parseError(response);

    response = await send(path, init, newAccessToken);
    if (response.status === 401) expireWebSession();
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}
