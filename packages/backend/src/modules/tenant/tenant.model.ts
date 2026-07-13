import { ForbiddenException } from '@nestjs/common';
import {
  AuthUser,
  CreateTenantDto,
  ListQuery,
  Paginated,
  Role,
  TenantListItem,
  TenantStatus,
  isPaginated,
} from '@nongchang/shared';

export interface TenantRow {
  id: string;
  name: string;
  code: string;
  status: string;
  createdAt: Date;
  _count?: { users: number; agents: number };
}

export const DEFAULT_TENANT_LIST_CAP = 500;

export const TENANT_LIST_SELECT = {
  id: true,
  name: true,
  code: true,
  status: true,
  createdAt: true,
  _count: { select: { users: true, agents: true } },
} as const;

export function resolveTenantListPagination(query?: ListQuery): { page: number; pageSize: number; skip: number; take: number } {
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? 20;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function buildTenantListWhere(query?: ListQuery): Record<string, unknown> {
  if (!query?.search) return {};
  return {
    OR: [
      { name: { contains: query.search, mode: 'insensitive' } },
      { code: { contains: query.search, mode: 'insensitive' } },
    ],
  };
}

export function buildTenantListFindManyArgs(query?: ListQuery) {
  const where = buildTenantListWhere(query);
  if (isPaginated(query)) {
    const { skip, take } = resolveTenantListPagination(query);
    return { where, orderBy: { createdAt: 'desc' as const }, select: TENANT_LIST_SELECT, skip, take };
  }
  return { where, orderBy: { createdAt: 'desc' as const }, select: TENANT_LIST_SELECT, skip: 0, take: DEFAULT_TENANT_LIST_CAP };
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

export function toTenantListItems(rows: TenantRow[]): TenantListItem[] {
  return rows.map(row => toTenantListItem(row));
}

export function toPaginatedTenantList(rows: TenantRow[], total: number, query?: ListQuery): Paginated<TenantListItem> {
  const { page, pageSize } = resolveTenantListPagination(query);
  return { items: toTenantListItems(rows), total, page, pageSize };
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
