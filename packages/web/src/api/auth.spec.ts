import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginDto } from '@nongchang/shared';
import { webLogin, webLogout } from './auth';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const loginDto: LoginDto = { tenantCode: 'tenant-a', username: 'farmer', password: 'password123' };

describe('web auth API', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('uses the web login endpoint with same-origin credentials and returns only access', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accessToken: 'access.token' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(webLogin(loginDto)).resolves.toEqual({ accessToken: 'access.token' });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/web/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginDto),
    });
  });

  it('uses the web logout endpoint with same-origin credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(webLogout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/web/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
  });
});
