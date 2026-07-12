import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));

import {
  allocateCredit, getBillingSummary, getLedger, getOrder, listCreditAccounts,
  listCreditPlans, rechargeCredit,
} from './billing';

const summary = { ownerType: 'MERCHANT', ownerId: 'm1', aiBalance: 10, codeBalance: 20 };
const account = {
  id: 'a1', ownerType: 'MERCHANT', ownerId: 'm1', ownerName: 'Farm',
  aiBalance: 10, codeBalance: 20,
};
const plan = {
  id: 'p1', name: 'Starter', resource: 'AI', quantity: 100, priceCents: 500,
  isUnit: false, active: true, createdAt: '2026-07-13T00:00:00.000Z',
};
const order = {
  id: 'o1', ownerType: 'MERCHANT', ownerId: 'm1', planId: 'p1', planName: 'Starter',
  resource: 'AI', quantity: 100, amountCents: 500, status: 'PENDING', paidAt: null,
  createdAt: '2026-07-13T00:00:00.000Z',
};
const ledger = { items: [], total: 0, page: 1, pageSize: 20 };

beforeEach(() => requestMock.mockReset());

describe('billing api client', () => {
  it('gets billing summary', async () => {
    requestMock.mockResolvedValueOnce(summary);
    await getBillingSummary();
    expect(requestMock).toHaveBeenCalledWith('/billing/summary');
  });

  it('lists credit accounts without pagination', async () => {
    requestMock.mockResolvedValueOnce([account]);
    await listCreditAccounts();
    expect(requestMock).toHaveBeenCalledWith('/billing/accounts');
  });

  it('lists credit accounts with pagination', async () => {
    requestMock.mockResolvedValueOnce({ items: [account], total: 1, page: 2, pageSize: 20 });
    await listCreditAccounts({ page: 2, pageSize: 20 });
    expect(requestMock).toHaveBeenCalledWith('/billing/accounts?page=2&pageSize=20');
  });

  it('lists credit plans with pagination', async () => {
    requestMock.mockResolvedValueOnce({ items: [plan], total: 1, page: 3, pageSize: 10 });
    await listCreditPlans({ page: 3, pageSize: 10 });
    expect(requestMock).toHaveBeenCalledWith('/billing/plans?page=3&pageSize=10');
  });

  it('gets an order', async () => {
    requestMock.mockResolvedValueOnce(order);
    await getOrder('order-1');
    expect(requestMock).toHaveBeenCalledWith('/billing/orders/order-1', undefined);
  });

  it('gets ledger without query parameters', async () => {
    requestMock.mockResolvedValueOnce(ledger);
    await getLedger({});
    expect(requestMock).toHaveBeenCalledWith('/billing/ledger');
  });

  it('gets ledger with query parameters', async () => {
    requestMock.mockResolvedValueOnce({ ...ledger, page: 2, pageSize: 50 });
    await getLedger({ resource: 'AI', page: 2, pageSize: 50 });
    expect(requestMock).toHaveBeenCalledWith('/billing/ledger?resource=AI&page=2&pageSize=50');
  });

  it('allocates credit', async () => {
    requestMock.mockResolvedValueOnce({ ok: true });
    const input = { targetOwnerType: 'MERCHANT', targetOwnerId: 'm1', resource: 'CODE', amount: 100 } as const;
    await allocateCredit(input);
    expect(requestMock).toHaveBeenCalledWith('/billing/allocate', {
      method: 'POST', body: JSON.stringify(input),
    });
  });

  it('recharges credit', async () => {
    requestMock.mockResolvedValueOnce({ ok: true });
    const input = { resource: 'AI', amount: 500 } as const;
    await rechargeCredit(input);
    expect(requestMock).toHaveBeenCalledWith('/billing/recharge', {
      method: 'POST', body: JSON.stringify(input),
    });
  });
});
