import { billingSummarySchema, paginatedLedgerSchema, type BillingSummary, type PaginatedLedger } from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function getBillingSummary(): Promise<BillingSummary> {
  return parseResponse(billingSummarySchema, await request<unknown>({ url: '/billing/summary' }), 'billing.summary');
}

export async function listLedger(page = 1, pageSize = 20): Promise<PaginatedLedger> {
  return parseResponse(paginatedLedgerSchema, await request<unknown>({
    url: `/billing/ledger?page=${page}&pageSize=${pageSize}`,
  }), 'billing.ledger');
}
