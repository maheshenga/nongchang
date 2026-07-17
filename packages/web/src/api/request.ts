import { webAccessTokenResponseSchema } from '@nongchang/shared';
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

export interface ApiFile {
  blob: Blob;
  fileName: string | null;
}

let onAuthExpired: (() => void) | null = null;

export function setOnAuthExpired(callback: () => void): void {
  onAuthExpired = callback;
}

let refreshing: Promise<string | null> | null = null;

function expireWebAccess(): null {
  clearAccessToken();
  onAuthExpired?.();
  return null;
}

export async function refreshWebSession(): Promise<string | null> {
  const expectedGeneration = getAccessTokenGeneration();
  try {
    const response = await fetch('/api/auth/web/refresh', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!response.ok) return expireWebAccess();

    const { accessToken } = webAccessTokenResponseSchema.parse(await response.json());
    return setAccessTokenIfCurrent(accessToken, expectedGeneration) ? accessToken : null;
  } catch {
    return expireWebAccess();
  }
}

function refreshAccess(): Promise<string | null> {
  if (!refreshing) {
    refreshing = refreshWebSession().finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function parseError(response: Response): Promise<ApiError> {
  let message = `请求失败 (${response.status})`;
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) message = body.message.join('; ');
    else if (body.message) message = body.message;
  } catch {
    // Keep the status-derived default.
  }
  return new ApiError(response.status, message);
}

async function send(path: string, init: RequestInit, accessToken: string | null): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (init.body && !(init.body instanceof FormData) && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(`/api${path}`, { ...init, headers });
}

async function authorizedResponse(path: string, init: RequestInit): Promise<Response> {
  const accessToken = getAccessToken();
  const accessTokenGeneration = getAccessTokenGeneration();
  let response = await send(path, init, accessToken);

  if (response.status === 401) {
    // Do not revive or retry a request after logout, login, or a concurrent
    // refresh changed the session that originally sent it.
    if (!accessToken || getAccessTokenGeneration() !== accessTokenGeneration) {
      throw await parseError(response);
    }
    const newAccess = await refreshAccess();
    if (!newAccess) throw await parseError(response);
    response = await send(path, init, newAccess);
    if (response.status === 401) expireWebAccess();
  }

  if (!response.ok) throw await parseError(response);
  return response;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authorizedResponse(path, init);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

function safeResponseFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;

  const encodedMatch = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  const plainMatch = contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i);
  let candidate: string | null = null;

  if (encodedMatch) {
    try {
      candidate = decodeURIComponent(encodedMatch[1].trim().replace(/^"|"$/g, ''));
    } catch {
      candidate = null;
    }
  } else if (plainMatch) {
    candidate = plainMatch[1].trim();
  }

  if (!candidate) return null;
  const basename = candidate
    .replace(/[\0\r\n]/g, '')
    .replace(/\\/g, '/')
    .split('/')
    .at(-1)
    ?.trim();
  if (!basename || basename === '.' || basename === '..') return null;
  return basename;
}

export async function requestFile(path: string, init: RequestInit = {}): Promise<ApiFile> {
  const response = await authorizedResponse(path, init);
  return {
    blob: await response.blob(),
    fileName: safeResponseFileName(response.headers.get('Content-Disposition')),
  };
}
