import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import { buildBuyerOrderWhere, resolveBillingBuyer, toCreditOrderView } from './billing.model';

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
