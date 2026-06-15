import type {
  CreateUserDto,
  PendingUserView,
  ReviewUserInput,
  CreateUserResponse,
  UpdateUserDto,
  MerchantListItem,
} from '@nongchang/shared';
import { request } from './request';

export interface UserListItem {
  id: string;
  username: string;
  role: string;
  agentId: string | null;
  displayName: string;
  status: string;
}

// 兼容旧引用:新建用户响应改用 shared 的 CreateUserResponse(含 initialPassword)
export type CreatedUser = CreateUserResponse;

export function listUsers(): Promise<UserListItem[]> {
  return request<UserListItem[]>('/users');
}

export function createUser(dto: CreateUserDto): Promise<CreateUserResponse> {
  return request<CreateUserResponse>('/users', { method: 'POST', body: JSON.stringify(dto) });
}

// 商户管理:聚合列表(含田块数/总面积)
export function listMerchants(): Promise<MerchantListItem[]> {
  return request<MerchantListItem[]>('/users/merchants');
}

export function updateUser(id: string, dto: UpdateUserDto): Promise<MerchantListItem> {
  return request<MerchantListItem>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

export function setUserStatus(id: string, status: 'active' | 'suspended'): Promise<{ id: string; status: string }> {
  return request(`/users/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
}

// 待审核(微信自助注册)用户
export function listPendingUsers(): Promise<PendingUserView[]> {
  return request<PendingUserView[]>('/users/pending');
}

export function reviewUser(id: string, input: ReviewUserInput): Promise<{ id: string; status: string }> {
  return request(`/users/${id}/review`, { method: 'POST', body: JSON.stringify(input) });
}
