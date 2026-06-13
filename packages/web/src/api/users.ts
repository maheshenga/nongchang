import type { CreateUserDto } from '@nongchang/shared';
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
