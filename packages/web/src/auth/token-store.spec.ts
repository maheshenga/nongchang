import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAccessToken, getAccessToken, setAccessToken } from './token-store';

describe('memory-only access token store', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAccessToken();
  });

  it('keeps the access token in module memory only', () => {
    setAccessToken('a.b.c');

    expect(getAccessToken()).toBe('a.b.c');
    expect(localStorage.length).toBe(0);
  });

  it('clears the in-memory token', () => {
    setAccessToken('a.b.c');
    clearAccessToken();

    expect(getAccessToken()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('removes legacy persisted token keys when the store initializes', async () => {
    localStorage.setItem('nc_access_token', 'legacy-access');
    localStorage.setItem('nc_refresh_token', 'legacy-refresh');

    vi.resetModules();
    await import('./token-store');

    expect(localStorage.getItem('nc_access_token')).toBeNull();
    expect(localStorage.getItem('nc_refresh_token')).toBeNull();
  });
});
