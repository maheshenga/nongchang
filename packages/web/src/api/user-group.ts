import {
  okResponseSchema,
  userGroupViewSchema,
  type AssignUserGroupInput,
  type UserGroupInput,
  type UserGroupView,
} from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function listUserGroups(): Promise<UserGroupView[]> {
  return parseResponse(userGroupViewSchema.array(), await request<unknown>('/user-groups'), 'userGroup.list');
}
export async function createUserGroup(input: UserGroupInput): Promise<UserGroupView> {
  return parseResponse(userGroupViewSchema, await request<unknown>('/user-groups', {
    method: 'POST', body: JSON.stringify(input),
  }), 'userGroup.create');
}
export async function updateUserGroup(id: string, input: UserGroupInput): Promise<UserGroupView> {
  return parseResponse(userGroupViewSchema, await request<unknown>(`/user-groups/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(input),
  }), 'userGroup.update');
}
export async function deleteUserGroup(id: string): Promise<{ ok: true }> {
  return parseResponse(okResponseSchema, await request<unknown>(`/user-groups/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }), 'userGroup.delete');
}
export async function assignUserGroup(input: AssignUserGroupInput): Promise<{ ok: true }> {
  return parseResponse(okResponseSchema, await request<unknown>('/user-groups/assign', {
    method: 'PUT', body: JSON.stringify(input),
  }), 'userGroup.assign');
}
