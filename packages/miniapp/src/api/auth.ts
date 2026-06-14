import Taro from '@tarojs/taro';
import { request } from './request';
import { setToken } from '../store/auth';
import { WX_APPID } from '../config/env';
import type { TokenPair } from '@nongchang/shared';

export async function login(username: string, password: string): Promise<void> {
  const res = await request<TokenPair>({
    url: '/auth/login',
    method: 'POST',
    data: { username, password },
  });
  setToken(res.accessToken);
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
  });
  setToken(res.accessToken);
}

