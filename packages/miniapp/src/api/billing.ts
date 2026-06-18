import type {
  BillingSummary, PaginatedLedger,
  CreditPlanView, CreateOrderInput, CreditOrderView, PaginatedOrders,
} from '@nongchang/shared';
import { request } from './request';

export function getBillingSummary(): Promise<BillingSummary> {
  return request<BillingSummary>({ url: '/billing/summary' });
}

export function listLedger(page = 1, pageSize = 20): Promise<PaginatedLedger> {
  return request<PaginatedLedger>({ url: `/billing/ledger?page=${page}&pageSize=${pageSize}` });
}

export function listCreditPlans(): Promise<CreditPlanView[]> {
  return request<CreditPlanView[]>({ url: '/billing/plans' });
}

export function listOrders(page = 1, pageSize = 20): Promise<PaginatedOrders> {
  return request<PaginatedOrders>({ url: `/billing/orders?page=${page}&pageSize=${pageSize}` });
}

export function createOrder(input: CreateOrderInput): Promise<CreditOrderView> {
  return request<CreditOrderView>({ url: '/billing/orders', method: 'POST', data: input });
}

export function payOrder(id: string): Promise<CreditOrderView> {
  return request<CreditOrderView>({ url: `/billing/orders/${id}/pay`, method: 'POST' });
}
