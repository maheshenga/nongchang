import type { BillingSummary, PaginatedLedger } from '@nongchang/shared';
import { request } from './request';

export function getBillingSummary(): Promise<BillingSummary> {
  return request<BillingSummary>({ url: '/billing/summary' });
}

export function listLedger(page = 1, pageSize = 20): Promise<PaginatedLedger> {
  return request<PaginatedLedger>({ url: `/billing/ledger?page=${page}&pageSize=${pageSize}` });
}
