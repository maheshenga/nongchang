import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAccessToken, getAccessToken, setAccessToken } from './token-store';

describe('token-store', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAccessToken();
  });

  it('returns null before a web access token has been set', () => {
    expect(getAccessToken()).toBeNull();
  });

  it('stores only an access token in module memory', () => {
    setAccessToken('a.b.c');

    expect(getAccessToken()).toBe('a.b.c');
    expect(localStorage.length).toBe(0);
  });

  it('clears the in-memory access token', () => {
    setAccessToken('a.b.c');
    clearAccessToken();

    expect(getAccessToken()).toBeNull();
  });

  it('does not restore legacy browser-stored tokens', () => {
    localStorage.setItem('nc_access_token', 'legacy-access');
    localStorage.setItem('nc_refresh_token', 'legacy-refresh');

    expect(getAccessToken()).toBeNull();
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
