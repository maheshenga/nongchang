import Taro from '@tarojs/taro';
import { getToken, clearToken } from '../store/auth';
import { API_BASE_URL } from '../config/env';

// 开发:微信开发者工具勾"不校验合法域名"连本机后端。
// 生产:改成线上 https 域名(需在小程序后台配置合法域名)。
export const BASE_URL = API_BASE_URL;

interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST';
  data?: Record<string, unknown>;
}

export async function request<T>({ url, method = 'GET', data }: RequestOptions): Promise<T> {
  const token = getToken();
  const res = await Taro.request({
    url: `${BASE_URL}${url}`,
    method,
    data,
    header: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.statusCode === 401) {
    clearToken();
    Taro.redirectTo({ url: '/pages/login/index' });
    throw new Error('登录已失效,请重新登录');
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const msg = (res.data as any)?.message || `请求失败(${res.statusCode})`;
    throw new Error(Array.isArray(msg) ? msg.join(',') : msg);
  }
  return res.data as T;
}

// 单文件上传(multipart),走 Taro.uploadFile 而非 request
export async function uploadFile(filePath: string): Promise<string> {
  const token = getToken();
  const res = await Taro.uploadFile({
    url: `${BASE_URL}/uploads`,
    filePath,
    name: 'file',
    header: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`图片上传失败(${res.statusCode})`);
  }
  const body = JSON.parse(res.data) as { url: string };
  return body.url;
}
