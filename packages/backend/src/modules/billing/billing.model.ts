import { ForbiddenException } from '@nestjs/common';
import type { AuthUser, CreditOrderView, OrderQuery, PaginatedOrders } from '@nongchang/shared';
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
