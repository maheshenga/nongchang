import { request } from './request';
import { setToken } from '../store/auth';
import type { TokenPair } from '@nongchang/shared';

export async function login(username: string, password: string): Promise<void> {
  const res = await request<TokenPair>({
    url: '/auth/login',
    method: 'POST',
    data: { username, password },
  });
  setToken(res.accessToken);
}
