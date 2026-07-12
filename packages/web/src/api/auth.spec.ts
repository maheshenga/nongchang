import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webLogin, webLogout } from './auth';

describe('web auth API', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('logs in through the HttpOnly-cookie web endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'access.token' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const dto = { tenantCode: 'demo', username: 'admin', password: 'secret1' };

    await expect(webLogin(dto)).resolves.toEqual({ accessToken: 'access.token' });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/web/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
  });

  it('logs out through the cookie-clearing endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(webLogout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/web/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
  });
});
