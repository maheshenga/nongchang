import { describe, it, expect, beforeEach } from 'vitest';
import taro from '@tarojs/taro';
import { getRefreshToken, getToken, setToken, setTokens, clearToken } from './auth';

describe('store/auth', () => {
  beforeEach(() => (taro as any).__reset());
  it('empty by default', () => expect(getToken()).toBe(''));
  it('set then get', () => { setToken('abc'); expect(getToken()).toBe('abc'); });
  it('stores access and refresh token pair', () => {
    setTokens({ accessToken: 'access', refreshToken: 'refresh' });
    expect(getToken()).toBe('access');
    expect(getRefreshToken()).toBe('refresh');
  });
  it('setToken clears any stale refresh token', () => {
    setTokens({ accessToken: 'access', refreshToken: 'refresh' });
    setToken('access-only');
    expect(getToken()).toBe('access-only');
    expect(getRefreshToken()).toBe('');
  });
  it('clear', () => {
    setTokens({ accessToken: 'abc', refreshToken: 'def' });
    clearToken();
    expect(getToken()).toBe('');
    expect(getRefreshToken()).toBe('');
  });
});
