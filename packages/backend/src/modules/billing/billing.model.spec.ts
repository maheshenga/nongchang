import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import {
  ACCOUNT_AGENT_SELECT,
  ACCOUNT_MERCHANT_SELECT,
  CREDIT_ORDER_PLAN_INCLUDE,
  DEFAULT_BILLING_ACCOUNT_LIST_CAP,
  buildCreditAccountBalanceWhere,
  buildBuyerOrderListFindManyArgs,
  buildBuyerOrderListWhere,
  buildBuyerOrderWhere,
  buildSubordinateAgentListFindManyArgs,
  buildSubordinateAgentListWhere,
  buildSubordinateMerchantListFindManyArgs,
  buildSubordinateMerchantListWhere,
  getSubordinateOwnerIds,
  resolveBillingAccountListPagination,
  resolveBillingBuyer,
  toAgentCreditAccountItems,
  toCreditOrderView,
  toMerchantCreditAccountItems,
  toPaginatedCreditAccountItems,
  toPaginatedCreditOrders,
} from './billing.model';

const actor = (overrides: Partial<AuthUser>): AuthUser => ({
  userId: 'u1',
  tenantId: 't1',
  role: Role.MERCHANT,
  agentId: null,
  ownerId: 'm1',
  sessionVersion: 0,
  ...overrides,
});

describe('billing.model buyer resolution', () => {
  it('resolves agent admin purchases to the agent account', () => {
    expect(resolveBillingBuyer(actor({ role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null }))).toEqual({
      ownerType: 'AGENT',
      ownerId: 'a1',
    });
  });

  it('resolves merchant purchases to the merchant account', () => {
    expect(resolveBillingBuyer(actor({ role: Role.MERCHANT, ownerId: 'm1' }))).toEqual({
      ownerType: 'MERCHANT',
      ownerId: 'm1',
    });
  });

  it('rejects agent admin purchases without agentId', () => {
    expect(() => resolveBillingBuyer(actor({ role: Role.AGENT_ADMIN, agentId: null, ownerId: null })))
      .toThrow(ForbiddenException);
  });

  it('rejects merchant purchases without ownerId', () => {
    expect(() => resolveBillingBuyer(actor({ role: Role.MERCHANT, ownerId: null })))
      .toThrow(ForbiddenException);
  });

  it('rejects tenant admins from self-service buying', () => {
    expect(() => resolveBillingBuyer(actor({ role: Role.SYSTEM_ADMIN, ownerId: null })))
      .toThrow(ForbiddenException);
  });
});

describe('billing.model order filters', () => {
  it('builds buyer-scoped order list filters', () => {
    expect(buildBuyerOrderWhere(actor({ role: Role.MERCHANT, ownerId: 'm1' }))).toEqual({
      tenantId: 't1',
      ownerType: 'MERCHANT',
      ownerId: 'm1',
    });
  });

  it('builds buyer-scoped order detail filters', () => {
    expect(buildBuyerOrderWhere(actor({ role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null }), 'o1')).toEqual({
      id: 'o1',
      tenantId: 't1',
      ownerType: 'AGENT',
      ownerId: 'a1',
    });
  });

  it('preserves empty order ids as explicit detail filters', () => {
    expect(buildBuyerOrderWhere(actor({ role: Role.MERCHANT, ownerId: 'm1' }), '')).toEqual({
      id: '',
      tenantId: 't1',
      ownerType: 'MERCHANT',
      ownerId: 'm1',
    });
  });
});

describe('billing.model account list helpers', () => {
  it('builds subordinate list args for platform and agent admins', () => {
    const sysWhere = buildSubordinateAgentListWhere(actor({ role: Role.SYSTEM_ADMIN }));
    const merchantWhere = buildSubordinateMerchantListWhere(actor({ role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null }));

    expect(resolveBillingAccountListPagination()).toEqual({
      paginated: false,
      page: 1,
      pageSize: 20,
      skip: 0,
      take: DEFAULT_BILLING_ACCOUNT_LIST_CAP,
    });
    expect(buildSubordinateAgentListFindManyArgs(sysWhere, { page: 2, pageSize: 10 })).toEqual({
      where: { tenantId: 't1' },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
      select: ACCOUNT_AGENT_SELECT,
    });
    expect(buildSubordinateMerchantListFindManyArgs(merchantWhere)).toEqual({
      where: { tenantId: 't1', role: Role.MERCHANT, agentId: 'a1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: DEFAULT_BILLING_ACCOUNT_LIST_CAP,
      select: ACCOUNT_MERCHANT_SELECT,
    });
  });

  it('rejects agent account listing without agentId before querying', () => {
    expect(() => buildSubordinateMerchantListWhere(actor({ role: Role.AGENT_ADMIN, agentId: null, ownerId: null })))
      .toThrow(ForbiddenException);
  });

  it('builds balance lookup where and account list projections', () => {
    const balances = new Map([
      ['a1', { id: 'accA1', aiBalance: 30, codeBalance: 40 }],
      ['m2', { id: 'accM2', aiBalance: 5, codeBalance: 0 }],
    ]);

    expect(getSubordinateOwnerIds([{ id: 'a1' }, { id: 'a2' }])).toEqual(['a1', 'a2']);
    expect(buildCreditAccountBalanceWhere('AGENT', [], 't1')).toBeNull();
    expect(buildCreditAccountBalanceWhere('AGENT', ['a1', 'a2'], 't1')).toEqual({
      tenantId: 't1',
      ownerType: 'AGENT',
      ownerId: { in: ['a1', 'a2'] },
    });
    expect(toAgentCreditAccountItems([
      { id: 'a1', name: 'Agent One' },
      { id: 'a2', name: 'Agent Two' },
    ], balances)).toEqual([
      { id: 'accA1', ownerType: 'AGENT', ownerId: 'a1', ownerName: 'Agent One', aiBalance: 30, codeBalance: 40 },
      { id: 'pending:AGENT:a2', ownerType: 'AGENT', ownerId: 'a2', ownerName: 'Agent Two', aiBalance: 0, codeBalance: 0 },
    ]);
    expect(toMerchantCreditAccountItems([
      { id: 'm1', displayName: null },
      { id: 'm2', displayName: 'Merchant Two' },
    ], balances)).toEqual([
      { id: 'pending:MERCHANT:m1', ownerType: 'MERCHANT', ownerId: 'm1', ownerName: 'm1', aiBalance: 0, codeBalance: 0 },
      { id: 'accM2', ownerType: 'MERCHANT', ownerId: 'm2', ownerName: 'Merchant Two', aiBalance: 5, codeBalance: 0 },
    ]);
  });

  it('builds paginated account envelopes', () => {
    const items = [{ id: 'accA1', ownerType: 'AGENT' as const, ownerId: 'a1', ownerName: 'Agent One', aiBalance: 1, codeBalance: 2 }];

    expect(toPaginatedCreditAccountItems(items, 3, { page: 2, pageSize: 1 })).toEqual({
      items,
      total: 3,
      page: 2,
      pageSize: 1,
    });
  });
});

describe('billing.model order list helpers', () => {
  it('adds optional order status to buyer-scoped list filters', () => {
    expect(buildBuyerOrderListWhere(actor({ role: Role.MERCHANT, ownerId: 'm1' }), { status: 'PAID' })).toEqual({
      tenantId: 't1',
      ownerType: 'MERCHANT',
      ownerId: 'm1',
      status: 'PAID',
    });
    expect(buildBuyerOrderListWhere(actor({ role: Role.MERCHANT, ownerId: 'm1' }), {})).toEqual({
      tenantId: 't1',
      ownerType: 'MERCHANT',
      ownerId: 'm1',
    });
  });

  it('builds order list findMany args with plan include and pagination', () => {
    const where = { tenantId: 't1', ownerType: 'MERCHANT', ownerId: 'm1', status: 'PENDING' };

    expect(buildBuyerOrderListFindManyArgs(where, { status: 'PENDING', page: 3, pageSize: 25 })).toEqual({
      where,
      orderBy: { createdAt: 'desc' },
      skip: 50,
      take: 25,
      include: CREDIT_ORDER_PLAN_INCLUDE,
    });
  });

  it('projects paginated orders with plan names', () => {
    expect(toPaginatedCreditOrders([
      {
        id: 'o1',
        ownerType: 'MERCHANT',
        ownerId: 'm1',
        planId: 'p1',
        resource: 'AI',
        quantity: 100,
        amountCents: 1000,
        status: 'PAID',
        paidAt: new Date('2026-01-02T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        plan: { name: 'Starter' },
      },
      {
        id: 'o2',
        ownerType: 'MERCHANT',
        ownerId: 'm1',
        planId: null,
        resource: 'CODE',
        quantity: 10,
        amountCents: 99,
        status: 'PENDING',
        paidAt: null,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        plan: null,
      },
    ], 7, { page: 2, pageSize: 2 })).toEqual({
      items: [
        expect.objectContaining({ id: 'o1', planName: 'Starter', paidAt: '2026-01-02T00:00:00.000Z' }),
        expect.objectContaining({ id: 'o2', planName: null, paidAt: null }),
      ],
      total: 7,
      page: 2,
      pageSize: 2,
    });
  });
});

describe('billing.model order views', () => {
  it('projects credit order rows to API views', () => {
    expect(toCreditOrderView({
      id: 'o1',
      ownerType: 'MERCHANT',
      ownerId: 'm1',
      planId: 'p1',
      resource: 'AI',
      quantity: 100,
      amountCents: 1000,
      status: 'PAID',
      paidAt: new Date('2026-01-02T03:04:05.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }, 'Starter')).toEqual({
      id: 'o1',
      ownerType: 'MERCHANT',
      ownerId: 'm1',
      planId: 'p1',
      planName: 'Starter',
      resource: 'AI',
      quantity: 100,
      amountCents: 1000,
      status: 'PAID',
      paidAt: '2026-01-02T03:04:05.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('normalizes missing planId and paidAt to null', () => {
    const view = toCreditOrderView({
      id: 'o2',
      ownerType: 'AGENT',
      ownerId: 'a1',
      planId: null,
      resource: 'CODE',
      quantity: 10,
      amountCents: 99,
      status: 'PENDING',
      paidAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(view.planId).toBeNull();
    expect(view.planName).toBeNull();
    expect(view.paidAt).toBeNull();
  });
});
