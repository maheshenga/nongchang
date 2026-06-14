import type { CreateUserDto, PendingUserView, ReviewUserInput } from '@nongchang/shared';
import { request } from './request';

export interface UserListItem {
  id: string;
  username: string;
  role: string;
  agentId: string | null;
  displayName: string;
  status: string;
}

export interface CreatedUser {
  id: string;
  username: string;
  role: string;
  agentId: string | null;
  displayName: string;
}

export function listUsers(): Promise<UserListItem[]> {
  return request<UserListItem[]>('/users');
}

export function createUser(dto: CreateUserDto): Promise<CreatedUser> {
  return request<CreatedUser>('/users', { method: 'POST', body: JSON.stringify(dto) });
}

// 待审核(微信自助注册)用户
export function listPendingUsers(): Promise<PendingUserView[]> {
  return request<PendingUserView[]>('/users/pending');
}

export function reviewUser(id: string, input: ReviewUserInput): Promise<{ id: string; status: string }> {
  return request(`/users/${id}/review`, { method: 'POST', body: JSON.stringify(input) });
}
