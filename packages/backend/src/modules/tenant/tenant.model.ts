import { ForbiddenException } from '@nestjs/common';
import {
  AuthUser,
  CreateTenantDto,
  Role,
  TenantListItem,
  TenantStatus,
} from '@nongchang/shared';

export interface TenantRow {
  id: string;
  name: string;
  code: string;
  status: string;
  createdAt: Date;
  _count?: { users: number; agents: number };
}

export function normalizeTenantCode(code: string): string {
  return code.trim().toUpperCase();
}

export function toTenantListItem(row: TenantRow): TenantListItem {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status as TenantStatus,
    createdAt: row.createdAt.toISOString(),
    userCount: row._count?.users ?? 0,
    agentCount: row._count?.agents ?? 0,
  };
}

export function buildTenantCreateData(dto: CreateTenantDto, code: string) {
  return { name: dto.name, code, status: 'active' as const };
}

export function buildTenantAdminCreateData(tenantId: string, passwordHash: string, dto: CreateTenantDto) {
  return {
    tenantId,
    username: dto.adminUsername,
    passwordHash,
    role: Role.SYSTEM_ADMIN,
    displayName: dto.adminDisplayName,
    phone: dto.adminPhone ?? null,
    status: 'active' as const,
  };
}

export function buildDefaultTenantGroupCreateData(tenantId: string, permissions: readonly string[]) {
  return {
    tenantId,
    name: '默认用户组',
    isDefault: true,
    permissions: [...permissions],
  };
}

export function assertCanSetTenantStatus(actor: AuthUser, tenantId: string, status: TenantStatus): void {
  if (tenantId === actor.tenantId && status === 'suspended') {
    throw new ForbiddenException('Cannot suspend the current platform tenant');
  }
}

export function toTenantStatusResult(row: { id: string; status: string }): { id: string; status: TenantStatus } {
  return { id: row.id, status: row.status as TenantStatus };
}
