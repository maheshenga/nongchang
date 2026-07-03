import Taro from '@tarojs/taro';
import type { TokenPair } from '@nongchang/shared';

const TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export function getToken(): string {
  try { return Taro.getStorageSync(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setToken(token: string): void {
  Taro.setStorageSync(TOKEN_KEY, token);
  Taro.removeStorageSync(REFRESH_TOKEN_KEY);
}
export function getRefreshToken(): string {
  try { return Taro.getStorageSync(REFRESH_TOKEN_KEY) || ''; } catch { return ''; }
}
export function setTokens(tokens: TokenPair): void {
  Taro.setStorageSync(TOKEN_KEY, tokens.accessToken);
  Taro.setStorageSync(REFRESH_TOKEN_KEY, tokens.refreshToken);
}
export function clearToken(): void {
  Taro.removeStorageSync(TOKEN_KEY);
  Taro.removeStorageSync(REFRESH_TOKEN_KEY);
}
