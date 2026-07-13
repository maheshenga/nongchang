import {
  meProfileViewSchema,
  okResponseSchema,
  webAccessTokenResponseSchema,
  type ChangePasswordDto,
  type LoginDto,
  type MeProfileView,
  type UpdateMeDto,
  type WebAccessTokenResponse,
} from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

async function authError(response: Response, fallback: string): Promise<Error> {
  let message = fallback;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'message' in body) {
      const value = (body as { message?: unknown }).message;
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) message = value.join('; ');
      else if (typeof value === 'string') message = value;
    }
  } catch {
    // Keep the caller-provided fallback.
  }
  return new Error(message);
}

export async function webLogin(dto: LoginDto): Promise<WebAccessTokenResponse> {
  const response = await fetch('/api/auth/web/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw await authError(response, '账号或密码错误');
  return parseResponse(webAccessTokenResponseSchema, await response.json(), 'auth.webLogin');
}

export async function webLogout(): Promise<void> {
  const response = await fetch('/api/auth/web/logout', { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) throw await authError(response, '退出登录失败');
}

export async function getMe(): Promise<MeProfileView> {
  return parseResponse(meProfileViewSchema, await request<unknown>('/auth/me'), 'auth.getMe');
}

export async function updateMe(dto: UpdateMeDto): Promise<MeProfileView> {
  return parseResponse(
    meProfileViewSchema,
    await request<unknown>('/auth/me', { method: 'PATCH', body: JSON.stringify(dto) }),
    'auth.updateMe',
  );
}

export async function changePassword(dto: ChangePasswordDto): Promise<{ ok: true }> {
  return parseResponse(
    okResponseSchema,
    await request<unknown>('/auth/me/password', { method: 'POST', body: JSON.stringify(dto) }),
    'auth.changePassword',
  );
}
