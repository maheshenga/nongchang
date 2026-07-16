import type { WebAccessTokenResponse } from '@nongchang/shared';
import {
  clearAccessToken,
  getAccessToken,
  getAccessTokenGeneration,
  setAccessTokenIfCurrent,
} from '../auth/token-store';

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

function expireWebSessionIfCurrent(expectedGeneration: number): void {
  if (getAccessTokenGeneration() === expectedGeneration) expireWebSession();
}

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const expectedGeneration = getAccessTokenGeneration();
  let response: Response;
  try {
    response = await fetch('/api/auth/web/refresh', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {
    expireWebSessionIfCurrent(expectedGeneration);
    return null;
  }

  if (!response.ok) {
    expireWebSessionIfCurrent(expectedGeneration);
    return null;
  }

  try {
    const body = (await response.json()) as WebAccessTokenResponse;
    if (!body.accessToken) throw new Error('Missing access token');
    return setAccessTokenIfCurrent(body.accessToken, expectedGeneration) ? body.accessToken : null;
  } catch {
    expireWebSessionIfCurrent(expectedGeneration);
    return null;
  }
}

export function refreshWebSession(): Promise<string | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
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
  const accessToken = getAccessToken();
  const accessTokenGeneration = getAccessTokenGeneration();
  let response = await send(path, init, accessToken);

  if (response.status === 401) {
    // A stale request must never revive or retry a session changed by logout,
    // login, or another refresh while that request was in flight.
    if (!accessToken || getAccessTokenGeneration() !== accessTokenGeneration) {
      throw await parseError(response);
    }
    const newAccessToken = await refreshWebSession();
    if (!newAccessToken) throw await parseError(response);

    const retryGeneration = getAccessTokenGeneration();
    response = await send(path, init, newAccessToken);
    if (response.status === 401) expireWebSessionIfCurrent(retryGeneration);
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}
