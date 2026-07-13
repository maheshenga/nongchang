import {
  billingSummarySchema,
  paginatedLedgerSchema,
  type BillingSummary,
  type CreditResource,
  type LedgerReason,
  type PaginatedLedger,
} from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function getBillingSummary(): Promise<BillingSummary> {
  return parseResponse(billingSummarySchema, await request<unknown>({ url: '/billing/summary' }), 'billing.summary');
}

export interface MiniappLedgerQuery {
  resource?: CreditResource;
  reason?: LedgerReason;
  page?: number;
  pageSize?: number;
}

export async function listLedger(query: MiniappLedgerQuery = {}): Promise<PaginatedLedger> {
  const params: string[] = [];
  if (query.resource) params.push(`resource=${encodeURIComponent(query.resource)}`);
  if (query.reason) params.push(`reason=${encodeURIComponent(query.reason)}`);
  params.push(`page=${query.page ?? 1}`);
  params.push(`pageSize=${query.pageSize ?? 20}`);
  return parseResponse(paginatedLedgerSchema, await request<unknown>({
    url: `/billing/ledger?${params.join('&')}`,
  }), 'billing.ledger');
}
