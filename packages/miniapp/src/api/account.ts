import Taro from '@tarojs/taro';
import {
  accountDataPreviewSchema,
  type AccountDataPreview,
  type CloseAccountInput,
} from '@nongchang/shared';
import { WX_APPID } from '../config/env';
import { clearToken } from '../store/auth';
import { parseResponse } from './parse-response';
import { downloadAuthenticated, request } from './request';

export async function getMyData(): Promise<AccountDataPreview> {
  return parseResponse(
    accountDataPreviewSchema,
    await request<unknown>({ url: '/auth/me/data' }),
    'account.data',
  );
}

export async function exportMyData(): Promise<string> {
  const tempFilePath = await downloadAuthenticated('/auth/me/data/export');
  const filePath = `${Taro.env.USER_DATA_PATH}/nongchang-account-data-${Date.now()}.json`;
  const saved = await Taro.saveFile({ tempFilePath, filePath });
  if (!('savedFilePath' in saved) || !saved.savedFilePath) {
    throw new Error('数据副本保存失败');
  }
  return saved.savedFilePath;
}

export async function shareMyData(filePath: string): Promise<void> {
  await Taro.shareFileMessage({ filePath, fileName: '农场账户数据副本.json' });
}

export async function closeMyAccount(input: CloseAccountInput): Promise<void> {
  await request<unknown>({
    url: '/auth/me/close',
    method: 'POST',
    data: { ...input },
  });
  clearToken();
}

export async function closeMyWechatAccount(): Promise<void> {
  if (!WX_APPID) throw new Error('未配置微信 AppID');
  const { code } = await Taro.login();
  if (!code) throw new Error('微信身份验证失败，请重试');
  await closeMyAccount({
    method: 'wechat',
    appId: WX_APPID,
    code,
    confirmation: '注销账号',
  });
}
