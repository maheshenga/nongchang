import Taro from '@tarojs/taro';
import {
  meProfileViewSchema,
  okResponseSchema,
  pendingResponseSchema,
  tokenPairSchema,
  type MeProfileView,
} from '@nongchang/shared';
import { WX_APPID } from '../config/env';
import { clearToken, setTokens } from '../store/auth';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function login(tenantCode: string, username: string, password: string): Promise<void> {
  const value = await request<unknown>({
    url: '/auth/login', method: 'POST', data: { tenantCode, username, password }, auth: false,
  });
  setTokens(parseResponse(tokenPairSchema, value, 'auth.login'));
}

export async function loginWechat(): Promise<void> {
  if (!WX_APPID) throw new Error('未配置微信 AppID');
  const { code } = await Taro.login();
  if (!code) throw new Error('微信登录失败,请重试');
  const value = await request<unknown>({
    url: '/auth/wechat', method: 'POST', data: { appId: WX_APPID, code }, auth: false,
  });
  setTokens(parseResponse(tokenPairSchema, value, 'auth.wechatLogin'));
}

export async function registerWechat(displayName: string, phone?: string): Promise<void> {
  if (!WX_APPID) throw new Error('未配置微信 AppID');
  const { code } = await Taro.login();
  if (!code) throw new Error('微信授权失败,请重试');
  const value = await request<unknown>({
    url: '/auth/wechat/register', method: 'POST',
    data: { appId: WX_APPID, code, displayName, ...(phone ? { phone } : {}) }, auth: false,
  });
  parseResponse(pendingResponseSchema, value, 'auth.wechatRegister');
  clearToken();
}

export async function getMe(): Promise<MeProfileView> {
  return parseResponse(meProfileViewSchema, await request<unknown>({ url: '/auth/me' }), 'auth.getMe');
}

export async function updateMe(data: { displayName?: string; phone?: string | null }): Promise<MeProfileView> {
  return parseResponse(meProfileViewSchema, await request<unknown>({
    url: '/auth/me', method: 'PATCH', data,
  }), 'auth.updateMe');
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<{ ok: true }> {
  return parseResponse(okResponseSchema, await request<unknown>({
    url: '/auth/me/password', method: 'POST', data: { oldPassword, newPassword },
  }), 'auth.changePassword');
}
