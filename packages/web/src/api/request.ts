import type { TokenPair } from '@nongchang/shared';
import { getTokens, setTokens, clearTokens } from '../auth/token-store';

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

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens) return null;
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    onAuthExpired?.();
    return null;
  }
  const pair = (await res.json()) as TokenPair;
  setTokens(pair);
  return pair.accessToken;
}

function refreshAccess(): Promise<string | null> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `请求失败 (${res.status})`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) message = body.message.join('; ');
    else if (body.message) message = body.message;
  } catch { /* keep default */ }
  return new ApiError(res.status, message);
}

async function send(path: string, init: RequestInit, accessToken: string | null): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (init.body && !('Content-Type' in headers) && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  return fetch(`/api${path}`, { ...init, headers });
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const access = getTokens()?.accessToken ?? null;
  let res = await send(path, init, access);

  if (res.status === 401) {
    const newAccess = await refreshAccess();
    if (!newAccess) throw await parseError(res);
    res = await send(path, init, newAccess);
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
