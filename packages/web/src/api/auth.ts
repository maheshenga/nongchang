import {
  webAccessTokenResponseSchema,
  type ChangePasswordDto,
  type LoginDto,
  type MeProfileView,
  type UpdateMeDto,
  type WebAccessTokenResponse,
} from '@nongchang/shared';
import { request } from './request';

async function authError(response: Response): Promise<Error> {
  let message = '账号或密码错误';
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) message = body.message;
  } catch {
    // Keep the generic authentication message for malformed error responses.
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
  if (!response.ok) throw await authError(response);
  return webAccessTokenResponseSchema.parse(await response.json());
}

export async function webLogout(): Promise<void> {
  const response = await fetch('/api/auth/web/logout', {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!response.ok) throw await authError(response);
}

export function getMe(): Promise<MeProfileView> {
  return request<MeProfileView>('/auth/me');
}

export function updateMe(dto: UpdateMeDto): Promise<MeProfileView> {
  return request<MeProfileView>('/auth/me', { method: 'PATCH', body: JSON.stringify(dto) });
}

export function changePassword(dto: ChangePasswordDto): Promise<{ ok: true }> {
  return request<{ ok: true }>('/auth/me/password', { method: 'POST', body: JSON.stringify(dto) });
}
