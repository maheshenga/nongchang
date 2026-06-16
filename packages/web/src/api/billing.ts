import type {
  BillingSummary, CreditAccountItem, PaginatedLedger, LedgerQuery,
  AllocateInput, RechargeInput,
} from '@nongchang/shared';
import { request } from './request';

export function getBillingSummary(): Promise<BillingSummary> {
  return request<BillingSummary>('/billing/summary');
}

export function listCreditAccounts(): Promise<CreditAccountItem[]> {
  return request<CreditAccountItem[]>('/billing/accounts');
}

export function getLedger(query: Partial<LedgerQuery> = {}): Promise<PaginatedLedger> {
  const qs = new URLSearchParams();
  if (query.resource) qs.set('resource', query.resource);
  if (query.reason) qs.set('reason', query.reason);
  if (query.page) qs.set('page', String(query.page));
  if (query.pageSize) qs.set('pageSize', String(query.pageSize));
  const s = qs.toString();
  return request<PaginatedLedger>(`/billing/ledger${s ? `?${s}` : ''}`);
}

export function allocateCredit(input: AllocateInput): Promise<unknown> {
  return request('/billing/allocate', { method: 'POST', body: JSON.stringify(input) });
}

export function rechargeCredit(input: RechargeInput): Promise<unknown> {
  return request('/billing/recharge', { method: 'POST', body: JSON.stringify(input) });
}
