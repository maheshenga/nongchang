import { describe, it, expect, beforeEach } from 'vitest';
import taro from '@tarojs/taro';
import { getToken, setToken, clearToken } from './auth';

describe('store/auth', () => {
  beforeEach(() => (taro as any).__reset());
  it('empty by default', () => expect(getToken()).toBe(''));
  it('set then get', () => { setToken('abc'); expect(getToken()).toBe('abc'); });
  it('clear', () => { setToken('abc'); clearToken(); expect(getToken()).toBe(''); });
});
