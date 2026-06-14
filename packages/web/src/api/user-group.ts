import type {
  UserGroupView, UserGroupInput, AssignUserGroupInput,
} from '@nongchang/shared';
import { request } from './request';

export function listUserGroups(): Promise<UserGroupView[]> {
  return request<UserGroupView[]>('/user-groups');
}
export function createUserGroup(input: UserGroupInput): Promise<UserGroupView> {
  return request<UserGroupView>('/user-groups', { method: 'POST', body: JSON.stringify(input) });
}
export function updateUserGroup(id: string, input: UserGroupInput): Promise<UserGroupView> {
  return request<UserGroupView>(`/user-groups/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteUserGroup(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/user-groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function assignUserGroup(input: AssignUserGroupInput): Promise<{ ok: true }> {
  return request<{ ok: true }>('/user-groups/assign', { method: 'PUT', body: JSON.stringify(input) });
}
