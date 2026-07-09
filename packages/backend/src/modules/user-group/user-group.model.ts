import type { AuthUser, UserGroupInput, UserGroupView } from '@nongchang/shared';
import { Role } from '@nongchang/shared';

export interface UserGroupRow {
  id: string;
  tenantId: string;
  name: string;
  isDefault: boolean;
  permissions: unknown;
  createdAt: Date;
}

export interface UserGroupCreateData {
  tenantId: string;
  name: string;
  isDefault: boolean;
  permissions: string[];
}

export type UserGroupUpdateData = Partial<Omit<UserGroupCreateData, 'tenantId'>>;

export function buildUserGroupView(row: UserGroupRow): UserGroupView {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    permissions: Array.isArray(row.permissions) ? (row.permissions as string[]) : [],
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

export function buildUserGroupCreateData(input: { tenantId: string; dto: UserGroupInput }): UserGroupCreateData {
  return {
    tenantId: input.tenantId,
    name: input.dto.name,
    isDefault: input.dto.isDefault ?? false,
    permissions: input.dto.permissions ?? [],
  };
}

export function buildUserGroupUpdateData(dto: UserGroupInput): UserGroupUpdateData {
  const data: UserGroupUpdateData = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;
  if (dto.permissions !== undefined) data.permissions = dto.permissions;
  return data;
}

export function buildDefaultUserGroupCreateData(input: { tenantId: string; permissions: readonly string[] }): UserGroupCreateData {
  return {
    tenantId: input.tenantId,
    name: '默认用户组',
    isDefault: true,
    permissions: [...input.permissions],
  };
}

export function buildUserGroupTenantWhere(input: { tenantId: string; id?: string; isDefault?: boolean }): Record<string, string | boolean> {
  const where: Record<string, string | boolean> = { tenantId: input.tenantId };
  if (input.id !== undefined) where.id = input.id;
  if (input.isDefault !== undefined) where.isDefault = input.isDefault;
  return where;
}

export function buildAssignUserScope(user: AuthUser): Record<string, string> {
  const scope: Record<string, string> = { tenantId: user.tenantId };
  if (user.role === Role.AGENT_ADMIN && user.agentId) {
    scope.agentId = user.agentId;
  }
  return scope;
}
