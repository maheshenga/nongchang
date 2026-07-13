import { ForbiddenException } from '@nestjs/common';
import type {
  AuthUser,
  CreditAccountItem,
  CreditOrderView,
  CreditOwnerType,
  ListQuery,
  OrderQuery,
  Paginated,
  PaginatedOrders,
} from '@nongchang/shared';
import { Role } from '@nongchang/shared';

export type BillingBuyer = { ownerType: 'AGENT' | 'MERCHANT'; ownerId: string };
export type BillingBuyerContext = 'purchase' | 'payment';

export interface CreditOrderRow {
  id: string;
  ownerType: CreditOrderView['ownerType'];
  ownerId: string;
  planId?: string | null;
  resource: CreditOrderView['resource'];
  quantity: number;
  amountCents: number;
  status: CreditOrderView['status'];
  paidAt?: Date | null;
  createdAt: Date;
}

export interface CreditOrderWithPlanRow extends CreditOrderRow {
  plan?: { name: string } | null;
}

export const CREDIT_ORDER_PLAN_INCLUDE = { plan: { select: { name: true } } } as const;

export const DEFAULT_BILLING_ACCOUNT_LIST_CAP = 500;

export const ACCOUNT_AGENT_SELECT = { id: true, name: true } as const;

export const ACCOUNT_MERCHANT_SELECT = { id: true, displayName: true } as const;

export interface AgentAccountRow {
  id: string;
  name: string;
}

export interface MerchantAccountRow {
  id: string;
  displayName: string | null;
}

export type BalanceMap = Map<string, { id: string; aiBalance: number; codeBalance: number }>;

export function resolveBillingAccountListPagination(query?: ListQuery): { paginated: boolean; page: number; pageSize: number; skip: number; take: number } {
  const paginated = query?.page !== undefined || query?.pageSize !== undefined;
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? 20;
  return {
    paginated,
    page,
    pageSize,
    skip: paginated ? (page - 1) * pageSize : 0,
    take: paginated ? pageSize : DEFAULT_BILLING_ACCOUNT_LIST_CAP,
  };
}

export function buildSubordinateAgentListWhere(user: AuthUser, query?: ListQuery): Record<string, unknown> {
  return {
    tenantId: user.tenantId,
    ...(query?.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };
}

export function buildSubordinateMerchantListWhere(user: AuthUser, query?: ListQuery): Record<string, unknown> {
  if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId');
  return {
    tenantId: user.tenantId,
    role: Role.MERCHANT,
    agentId: user.agentId,
    ...(query?.search ? { displayName: { contains: query.search, mode: 'insensitive' } } : {}),
  };
}

export function buildCreditPlanListWhere(user: AuthUser, query?: ListQuery): Record<string, unknown> {
  return {
    tenantId: user.tenantId,
    ...(user.role !== Role.SYSTEM_ADMIN ? { active: true } : {}),
    ...(query?.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };
}

export function buildSubordinateAgentListFindManyArgs(where: Record<string, unknown>, query?: ListQuery) {
  const pagination = resolveBillingAccountListPagination(query);
  return {
    where,
    orderBy: { createdAt: 'desc' as const },
    skip: pagination.skip,
    take: pagination.take,
    select: ACCOUNT_AGENT_SELECT,
  };
}

export function buildSubordinateMerchantListFindManyArgs(where: Record<string, unknown>, query?: ListQuery) {
  const pagination = resolveBillingAccountListPagination(query);
  return {
    where,
    orderBy: { createdAt: 'desc' as const },
    skip: pagination.skip,
    take: pagination.take,
    select: ACCOUNT_MERCHANT_SELECT,
  };
}

export function getSubordinateOwnerIds(rows: Array<{ id: string }>): string[] {
  return rows.map(row => row.id);
}

export function buildCreditAccountBalanceWhere(
  ownerType: CreditOwnerType,
  ownerIds: string[],
  tenantId: string,
): { tenantId: string; ownerType: CreditOwnerType; ownerId: { in: string[] } } | null {
  return ownerIds.length ? { tenantId, ownerType, ownerId: { in: ownerIds } } : null;
}

export function toAgentCreditAccountItems(agents: AgentAccountRow[], balances: BalanceMap): CreditAccountItem[] {
  return agents.map(agent => {
    const balance = balances.get(agent.id);
    return {
      id: balance?.id ?? `pending:AGENT:${agent.id}`,
      ownerType: 'AGENT',
      ownerId: agent.id,
      ownerName: agent.name,
      aiBalance: balance?.aiBalance ?? 0,
      codeBalance: balance?.codeBalance ?? 0,
    };
  });
}

export function toMerchantCreditAccountItems(merchants: MerchantAccountRow[], balances: BalanceMap): CreditAccountItem[] {
  return merchants.map(merchant => {
    const balance = balances.get(merchant.id);
    return {
      id: balance?.id ?? `pending:MERCHANT:${merchant.id}`,
      ownerType: 'MERCHANT',
      ownerId: merchant.id,
      ownerName: merchant.displayName ?? merchant.id,
      aiBalance: balance?.aiBalance ?? 0,
      codeBalance: balance?.codeBalance ?? 0,
    };
  });
}

export function toPaginatedCreditAccountItems(
  items: CreditAccountItem[],
  total: number,
  query?: ListQuery,
): Paginated<CreditAccountItem> {
  const { page, pageSize } = resolveBillingAccountListPagination(query);
  return { items, total, page, pageSize };
}

export function resolveBillingBuyer(user: AuthUser, context: BillingBuyerContext = 'purchase'): BillingBuyer {
  if (user.role === Role.AGENT_ADMIN) {
    if (!user.agentId) {
      throw new ForbiddenException(context === 'payment' ? 'agent_admin 缺少 agentId' : 'agent_admin 缺少 agentId,拒绝购买');
    }
    return { ownerType: 'AGENT', ownerId: user.agentId };
  }
  if (user.role === Role.MERCHANT) {
    if (!user.ownerId) {
      throw new ForbiddenException(context === 'payment' ? 'merchant 缺少 ownerId' : 'merchant 缺少 ownerId,拒绝购买');
    }
    return { ownerType: 'MERCHANT', ownerId: user.ownerId };
  }
  throw new ForbiddenException(context === 'payment' ? '当前角色不支持支付' : '当前角色不支持自助购买额度');
}

export function buildBuyerOrderWhere(user: AuthUser, id?: string): Record<string, string> {
  const buyer = resolveBillingBuyer(user);
  return {
    ...(id !== undefined ? { id } : {}),
    tenantId: user.tenantId,
    ownerType: buyer.ownerType,
    ownerId: buyer.ownerId,
  };
}

export function buildBuyerOrderListWhere(user: AuthUser, query: Pick<OrderQuery, 'status'>): Record<string, unknown> {
  return { ...buildBuyerOrderWhere(user), ...(query.status ? { status: query.status } : {}) };
}

export function buildBuyerOrderListFindManyArgs(where: Record<string, unknown>, query: OrderQuery) {
  return {
    where,
    orderBy: { createdAt: 'desc' as const },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
    include: CREDIT_ORDER_PLAN_INCLUDE,
  };
}

export function toCreditOrderView(row: CreditOrderRow, planName: string | null = null): CreditOrderView {
  return {
    id: row.id,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    planId: row.planId ?? null,
    planName,
    resource: row.resource,
    quantity: row.quantity,
    amountCents: row.amountCents,
    status: row.status,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPaginatedCreditOrders(rows: CreditOrderWithPlanRow[], total: number, query: OrderQuery): PaginatedOrders {
  return {
    items: rows.map(row => toCreditOrderView(row, row.plan?.name ?? null)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
