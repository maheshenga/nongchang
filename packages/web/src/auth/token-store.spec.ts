import { describe, it, expect, beforeEach } from 'vitest';
import { getTokens, setTokens, clearTokens } from './token-store';

describe('token-store', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no tokens stored', () => {
    expect(getTokens()).toBeNull();
  });

  it('round-trips a token pair', () => {
    setTokens({ accessToken: 'a.b.c', refreshToken: 'r.e.f' });
    expect(getTokens()).toEqual({ accessToken: 'a.b.c', refreshToken: 'r.e.f' });
  });

  it('clearTokens removes stored tokens', () => {
    setTokens({ accessToken: 'a.b.c', refreshToken: 'r.e.f' });
    clearTokens();
    expect(getTokens()).toBeNull();
  });

  it('returns null when only one token present (corrupted state)', () => {
    localStorage.setItem('nc_access_token', 'a.b.c');
    expect(getTokens()).toBeNull();
  });
});
