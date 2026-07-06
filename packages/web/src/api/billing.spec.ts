import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));

import {
  getBillingSummary, listCreditAccounts, getLedger, allocateCredit, rechargeCredit,
  listCreditPlans, getOrder,
} from './billing';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('billing api client', () => {
  it('getBillingSummary GET /billing/summary', async () => {
    await getBillingSummary();
    expect(requestMock).toHaveBeenCalledWith('/billing/summary');
  });
  it('listCreditAccounts GET /billing/accounts', async () => {
    await listCreditAccounts();
    expect(requestMock).toHaveBeenCalledWith('/billing/accounts');
  });
  it('listCreditAccounts 带分页参数时拼接 querystring', async () => {
    await listCreditAccounts({ page: 2, pageSize: 20 });
    expect(requestMock).toHaveBeenCalledWith('/billing/accounts?page=2&pageSize=20');
  });
  it('listCreditPlans 带分页参数时拼接 querystring', async () => {
    await listCreditPlans({ page: 3, pageSize: 10 });
    expect(requestMock).toHaveBeenCalledWith('/billing/plans?page=3&pageSize=10');
  });
  it('getOrder GET /billing/orders/:id', async () => {
    await getOrder('order-1');
    expect(requestMock).toHaveBeenCalledWith('/billing/orders/order-1');
  });
  it('getLedger 无参数 GET /billing/ledger', async () => {
    await getLedger({});
    expect(requestMock).toHaveBeenCalledWith('/billing/ledger');
  });
  it('getLedger 带参数拼接 querystring', async () => {
    await getLedger({ resource: 'AI', page: 2, pageSize: 50 });
    expect(requestMock).toHaveBeenCalledWith('/billing/ledger?resource=AI&page=2&pageSize=50');
  });
  it('allocateCredit POST /billing/allocate 带 body', async () => {
    const input = { targetOwnerType: 'MERCHANT', targetOwnerId: 'm1', resource: 'CODE', amount: 100 } as const;
    await allocateCredit(input);
    expect(requestMock).toHaveBeenCalledWith('/billing/allocate', {
      method: 'POST', body: JSON.stringify(input),
    });
  });
  it('rechargeCredit POST /billing/recharge 带 body', async () => {
    const input = { resource: 'AI', amount: 500 } as const;
    await rechargeCredit(input);
    expect(requestMock).toHaveBeenCalledWith('/billing/recharge', {
      method: 'POST', body: JSON.stringify(input),
    });
  });
});
