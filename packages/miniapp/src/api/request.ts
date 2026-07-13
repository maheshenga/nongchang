import Taro from '@tarojs/taro';
import { getRefreshToken, getToken, setTokens, clearToken } from '../store/auth';
import { isTokenExpired } from '../utils/token';
import { API_BASE_URL } from '../config/env';
import type { TokenPair } from '@nongchang/shared';

// API 基址由 config/env.ts 经 Taro 编译期环境变量 TARO_APP_API 注入。
// 开发:微信开发者工具勾"不校验合法域名"连本机后端(默认 localhost:3001/api)。
// 生产:在 config/prod.ts 注入线上 https 域名,并在小程序后台配置合法域名。
export const BASE_URL = API_BASE_URL;

interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PATCH';
  data?: Record<string, unknown>;
  auth?: boolean;
  header?: Record<string, string>;
}

class RequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// 默认请求超时(ms)。弱网下避免请求长时间挂起无反馈。
const TIMEOUT = 20000;
let refreshPromise: Promise<string> | null = null;

function expireSession(): never {
  clearToken();
  Taro.redirectTo({ url: '/pages/login/index' });
  throw new Error('登录已失效,请重新登录');
}

async function refreshAccessTokenWith(refreshToken: string): Promise<string> {
  const res = await Taro.request({
    url: `${BASE_URL}/auth/refresh`,
    method: 'POST',
    data: { refreshToken },
    timeout: TIMEOUT,
    header: { 'Content-Type': 'application/json' },
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    if (getRefreshToken() === refreshToken) expireSession();
    const currentAccess = getToken();
    if (currentAccess) return currentAccess;
    expireSession();
  }
  const pair = res.data as TokenPair;
  if (getRefreshToken() !== refreshToken) {
    const currentAccess = getToken();
    if (currentAccess) return currentAccess;
    expireSession();
  }
  setTokens(pair);
  return pair.accessToken;
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) expireSession();
  refreshPromise ??= refreshAccessTokenWith(refreshToken).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function getUsableAccessToken(): Promise<string> {
  const token = getToken();
  if (!token) expireSession();
  if (token && isTokenExpired(token)) return refreshAccessToken();
  return token;
}

async function send<T>({ url, method = 'GET', data, auth = true, header = {} }: RequestOptions, token: string): Promise<T> {
  const res = await Taro.request({
    url: `${BASE_URL}${url}`,
    method,
    data,
    timeout: TIMEOUT,
    header: {
      'Content-Type': 'application/json',
      ...header,
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const msg = (res.data as any)?.message || `请求失败(${res.statusCode})`;
    throw new RequestError(res.statusCode, Array.isArray(msg) ? msg.join(',') : msg);
  }
  return res.data as T;
}

export async function request<T>({ url, method = 'GET', data, auth = true, header = {} }: RequestOptions): Promise<T> {
  // 本地预判 token 过期:省掉一次必然 401 的往返,优先用 refresh token 静默续期。
  let token = auth ? await getUsableAccessToken() : '';
  try {
    return await send<T>({ url, method, data, auth, header }, token);
  } catch (err) {
    if (!auth || !(err instanceof RequestError) || err.status !== 401) throw err;
    if (!getRefreshToken()) {
      expireSession();
    }
    token = await refreshAccessToken();
    try {
      return await send<T>({ url, method, data, auth, header }, token);
    } catch (retryErr) {
      if (retryErr instanceof RequestError && retryErr.status === 401) expireSession();
      throw retryErr;
    }
  }
}

export async function uploadMultipart(url: string, filePath: string, header: Record<string, string> = {}): Promise<{ statusCode: number; data: string }> {
  let token = await getUsableAccessToken();
  let res = await Taro.uploadFile({
    url: `${BASE_URL}${url}`,
    filePath,
    name: 'file',
    timeout: TIMEOUT,
    header: { ...header, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (res.statusCode === 401) {
    if (!getRefreshToken()) expireSession();
    token = await refreshAccessToken();
    res = await Taro.uploadFile({
      url: `${BASE_URL}${url}`,
      filePath,
      name: 'file',
      timeout: TIMEOUT,
      header: { ...header, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (res.statusCode === 401) expireSession();
  }
  return { statusCode: res.statusCode, data: res.data };
}

// 单文件上传(multipart),走 Taro.uploadFile 而非 request
export type UploadPurpose = 'farm-record' | 'credential' | 'ai-diagnose';

export async function uploadFile(filePath: string, purpose: UploadPurpose): Promise<string> {
  const res = await uploadMultipart(`/uploads?purpose=${encodeURIComponent(purpose)}`, filePath);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`图片上传失败(${res.statusCode})`);
  }
  const body = JSON.parse(res.data) as { url: string };
  return body.url;
}
