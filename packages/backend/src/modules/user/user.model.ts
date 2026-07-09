import { ForbiddenException } from '@nestjs/common';
import { AuthUser, CreateUserDto, ListQuery, Paginated, ReviewUserInput, Role, isPaginated } from '@nongchang/shared';

export function buildUserScopedWhere(actor: AuthUser): Record<string, string> {
  const where: Record<string, string> = { tenantId: actor.tenantId };
  if (actor.role === Role.AGENT_ADMIN) {
    if (!actor.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝访问');
    where.agentId = actor.agentId;
  }
  return where;
}

export const DEFAULT_USER_LIST_CAP = 500;

export const USER_LIST_SELECT = {
  id: true,
  username: true,
  role: true,
  agentId: true,
  displayName: true,
  status: true,
} as const;

export const MERCHANT_USER_LIST_SELECT = {
  id: true,
  username: true,
  displayName: true,
  phone: true,
  status: true,
  agentId: true,
  createdAt: true,
} as const;

export const PENDING_USER_LIST_SELECT = {
  id: true,
  displayName: true,
  phone: true,
  createdAt: true,
} as const;

export interface MerchantListRow {
  id: string;
  username: string;
  displayName: string;
  phone: string | null;
  status: string;
  agentId: string | null;
  createdAt: Date;
}

export interface MerchantFieldAggregateRow {
  ownerId: string;
  _count: { _all: number };
  _sum: { area: number | null };
}

export function resolveUserListPagination(query?: ListQuery): { paginated: boolean; page: number; pageSize: number; skip: number; take: number } {
  const paginated = isPaginated(query);
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? 20;
  return {
    paginated,
    page,
    pageSize,
    skip: paginated ? (page - 1) * pageSize : 0,
    take: paginated ? pageSize : DEFAULT_USER_LIST_CAP,
  };
}

export function buildUserListFindManyArgs(where: Record<string, unknown>, query?: ListQuery) {
  const pagination = resolveUserListPagination(query);
  return {
    where,
    select: USER_LIST_SELECT,
    orderBy: { createdAt: 'desc' as const },
    skip: pagination.skip,
    take: pagination.take,
  };
}

export function buildMerchantListWhere(actor: AuthUser): Record<string, unknown> {
  return { ...buildUserScopedWhere(actor), role: Role.MERCHANT, status: { not: 'pending' } };
}

export function buildMerchantListFindManyArgs(where: Record<string, unknown>, query?: ListQuery) {
  const pagination = resolveUserListPagination(query);
  return {
    where,
    orderBy: { createdAt: 'desc' as const },
    select: MERCHANT_USER_LIST_SELECT,
    skip: pagination.skip,
    take: pagination.take,
  };
}

export function buildPendingMerchantListWhere(actor: AuthUser): Record<string, unknown> {
  return { ...buildUserScopedWhere(actor), role: Role.MERCHANT, status: 'pending' };
}

export function buildPendingMerchantListFindManyArgs(where: Record<string, unknown>, query?: ListQuery) {
  const pagination = resolveUserListPagination(query);
  return {
    where,
    orderBy: { createdAt: 'desc' as const },
    select: PENDING_USER_LIST_SELECT,
    skip: pagination.skip,
    take: pagination.take,
  };
}

export function toPaginatedUserList<T>(items: T[], total: number, query?: ListQuery): Paginated<T> {
  const { page, pageSize } = resolveUserListPagination(query);
  return { items, total, page, pageSize };
}

export function getMerchantIds(merchants: Array<{ id: string }>): string[] {
  return merchants.map(merchant => merchant.id);
}

export function buildMerchantFieldAggregateWhere(
  tenantId: string,
  merchantIds: string[],
): { tenantId: string; ownerId: { in: string[] } } | null {
  return merchantIds.length ? { tenantId, ownerId: { in: merchantIds } } : null;
}

export function toMerchantListItems(merchants: MerchantListRow[], aggregates: MerchantFieldAggregateRow[]) {
  const byOwner = new Map(aggregates.map(aggregate => [aggregate.ownerId, aggregate]));
  return merchants.map(merchant => {
    const aggregate = byOwner.get(merchant.id);
    return {
      id: merchant.id,
      username: merchant.username,
      displayName: merchant.displayName,
      phone: merchant.phone,
      status: merchant.status,
      agentId: merchant.agentId,
      createdAt: merchant.createdAt.toISOString(),
      fieldCount: aggregate?._count._all ?? 0,
      totalArea: aggregate?._sum.area ?? 0,
    };
  });
}

export function resolveCreateUserAgentId(
  actor: AuthUser,
  dto: Pick<CreateUserDto, 'role' | 'agentId'>,
): string | null {
  if (actor.role === Role.AGENT_ADMIN) {
    if (dto.role !== Role.MERCHANT) throw new ForbiddenException('代理商只能创建商家账号');
    if (!actor.agentId) throw new ForbiddenException('Agent admin is missing agentId');
    return actor.agentId;
  }
  if (dto.role === Role.MEMBER) return null;
  return dto.agentId ?? null;
}

export function buildMerchantTargetWhere(
  actor: AuthUser,
  id: string,
  statusFilter: 'pending' | 'manageable',
): Record<string, unknown> {
  return {
    ...buildUserScopedWhere(actor),
    id,
    role: Role.MERCHANT,
    status: statusFilter === 'pending' ? 'pending' : { not: 'pending' },
  };
}

export function buildUserStatusUpdateData(status: 'active' | 'suspended'): Record<string, unknown> {
  const data: Record<string, unknown> = { status };
  if (status === 'suspended') data.sessionVersion = { increment: 1 };
  return data;
}

export function reviewActionToStatus(action: ReviewUserInput['action']): 'active' | 'rejected' {
  return action === 'approve' ? 'active' : 'rejected';
}
