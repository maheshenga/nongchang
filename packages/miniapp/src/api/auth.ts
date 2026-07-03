import Taro from '@tarojs/taro';
import { request } from './request';
import { clearToken, setTokens } from '../store/auth';
import { WX_APPID } from '../config/env';
import type { TokenPair, MeProfileView } from '@nongchang/shared';

export async function login(tenantCode: string, username: string, password: string): Promise<void> {
  const res = await request<TokenPair>({
    url: '/auth/login',
    method: 'POST',
    data: { tenantCode, username, password },
    auth: false,
  });
  setTokens(res);
}

// 微信一键登录:wx.login 取 code → 后端用 appId 反查租户并 jscode2session 换 openid。
export async function loginWechat(): Promise<void> {
  if (!WX_APPID) throw new Error('未配置微信 AppID');
  const { code } = await Taro.login();
  if (!code) throw new Error('微信登录失败,请重试');
  const res = await request<TokenPair>({
    url: '/auth/wechat',
    method: 'POST',
    data: { appId: WX_APPID, code },
    auth: false,
  });
  setTokens(res);
}

// 微信自助注册:微信授权取 code + 补全资料,提交后落 pending 待后台审核,不下发 token。
export async function registerWechat(displayName: string, phone?: string): Promise<void> {
  if (!WX_APPID) throw new Error('未配置微信 AppID');
  const { code } = await Taro.login();
  if (!code) throw new Error('微信授权失败,请重试');
  await request<{ status: 'pending' }>({
    url: '/auth/wechat/register',
    method: 'POST',
    data: { appId: WX_APPID, code, displayName, ...(phone ? { phone } : {}) },
    auth: false,
  });
  clearToken();
}

// ── 个人账号 ──
export function getMe(): Promise<MeProfileView> {
  return request<MeProfileView>({ url: '/auth/me' });
}

export function updateMe(data: { displayName?: string; phone?: string | null }): Promise<MeProfileView> {
  return request<MeProfileView>({ url: '/auth/me', method: 'PATCH', data });
}

export function changePassword(oldPassword: string, newPassword: string): Promise<{ ok: true }> {
  return request<{ ok: true }>({ url: '/auth/me/password', method: 'POST', data: { oldPassword, newPassword } });
}

