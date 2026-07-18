import {
  alipayConfigViewSchema,
  billingSummarySchema,
  creditAccountItemSchema,
  creditOrderViewSchema,
  creditPlanViewSchema,
  idResponseSchema,
  okResponseSchema,
  paginatedLedgerSchema,
  paginatedOrdersSchema,
  paginatedResponseSchema,
  paymentViewSchema,
  type AlipayConfigInput,
  type AlipayConfigView,
  type AllocateInput,
  type BillingSummary,
  type CreateCreditPlanInput,
  type CreateOrderInput,
  type CreatePaymentInput,
  type CreditAccountItem,
  type CreditOrderView,
  type CreditPlanView,
  type LedgerQuery,
  type ListQuery,
  type OrderQuery,
  type Paginated,
  type PaginatedLedger,
  type PaginatedOrders,
  type PaymentView,
  type RechargeInput,
  type UpdateCreditPlanInput,
} from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function getBillingSummary(): Promise<BillingSummary> {
  return parseResponse(billingSummarySchema, await request<unknown>('/billing/summary'), 'billing.summary');
}

function withListQuery(path: string, query: Partial<ListQuery> = {}) {
  const qs = new URLSearchParams();
  if (query.page) qs.set('page', String(query.page));
  if (query.pageSize) qs.set('pageSize', String(query.pageSize));
  const value = qs.toString();
  return `${path}${value ? `?${value}` : ''}`;
}

export async function listCreditAccounts<T extends Partial<ListQuery> | undefined = undefined>(
  query?: T,
): Promise<T extends undefined ? CreditAccountItem[] : Paginated<CreditAccountItem>> {
  const value = await request<unknown>(withListQuery('/billing/accounts', query ?? {}));
  if (query === undefined) {
    return parseResponse(creditAccountItemSchema.array(), value, 'billing.accounts') as
      T extends undefined ? CreditAccountItem[] : Paginated<CreditAccountItem>;
  }
  return parseResponse(paginatedResponseSchema(creditAccountItemSchema), value, 'billing.accounts') as
    T extends undefined ? CreditAccountItem[] : Paginated<CreditAccountItem>;
}

export async function getLedger(query: Partial<LedgerQuery> = {}): Promise<PaginatedLedger> {
  const qs = new URLSearchParams();
  if (query.resource) qs.set('resource', query.resource);
  if (query.reason) qs.set('reason', query.reason);
  if (query.page) qs.set('page', String(query.page));
  if (query.pageSize) qs.set('pageSize', String(query.pageSize));
  const value = qs.toString();
  return parseResponse(paginatedLedgerSchema, await request<unknown>(
    `/billing/ledger${value ? `?${value}` : ''}`,
  ), 'billing.ledger');
}

export async function allocateCredit(input: AllocateInput): Promise<{ ok: true }> {
  return parseResponse(okResponseSchema, await request<unknown>('/billing/allocate', {
    method: 'POST', body: JSON.stringify(input),
  }), 'billing.allocate');
}

export async function rechargeCredit(input: RechargeInput): Promise<{ ok: true }> {
  return parseResponse(okResponseSchema, await request<unknown>('/billing/recharge', {
    method: 'POST', body: JSON.stringify(input),
  }), 'billing.recharge');
}

export async function listCreditPlans<T extends Partial<ListQuery> | undefined = undefined>(
  query?: T,
): Promise<T extends undefined ? CreditPlanView[] : Paginated<CreditPlanView>> {
  const value = await request<unknown>(withListQuery('/billing/plans', query ?? {}));
  if (query === undefined) {
    return parseResponse(creditPlanViewSchema.array(), value, 'billing.plans') as
      T extends undefined ? CreditPlanView[] : Paginated<CreditPlanView>;
  }
  return parseResponse(paginatedResponseSchema(creditPlanViewSchema), value, 'billing.plans') as
    T extends undefined ? CreditPlanView[] : Paginated<CreditPlanView>;
}

export async function createCreditPlan(input: CreateCreditPlanInput): Promise<CreditPlanView> {
  return parseResponse(creditPlanViewSchema, await request<unknown>('/billing/plans', {
    method: 'POST', body: JSON.stringify(input),
  }), 'billing.createPlan');
}

export async function updateCreditPlan(id: string, input: UpdateCreditPlanInput): Promise<CreditPlanView> {
  return parseResponse(creditPlanViewSchema, await request<unknown>(`/billing/plans/${id}`, {
    method: 'PATCH', body: JSON.stringify(input),
  }), 'billing.updatePlan');
}

export async function removeCreditPlan(id: string): Promise<{ id: string }> {
  return parseResponse(idResponseSchema, await request<unknown>(`/billing/plans/${id}`, { method: 'DELETE' }), 'billing.removePlan');
}

export async function listOrders(query: Partial<OrderQuery> = {}): Promise<PaginatedOrders> {
  const qs = new URLSearchParams();
  if (query.status) qs.set('status', query.status);
  if (query.page) qs.set('page', String(query.page));
  if (query.pageSize) qs.set('pageSize', String(query.pageSize));
  const value = qs.toString();
  return parseResponse(paginatedOrdersSchema, await request<unknown>(
    `/billing/orders${value ? `?${value}` : ''}`,
  ), 'billing.orders');
}

async function order(path: string, init: RequestInit | undefined, label: string): Promise<CreditOrderView> {
  return parseResponse(creditOrderViewSchema, await request<unknown>(path, init), label);
}
export function getOrder(id: string): Promise<CreditOrderView> {
  return order(`/billing/orders/${id}`, undefined, 'billing.getOrder');
}
export function createOrder(input: CreateOrderInput): Promise<CreditOrderView> {
  return order('/billing/orders', { method: 'POST', body: JSON.stringify(input) }, 'billing.createOrder');
}
export function payOrder(id: string): Promise<CreditOrderView> {
  return order(`/billing/orders/${id}/pay`, { method: 'POST' }, 'billing.payOrder');
}
export function cancelOrder(id: string): Promise<CreditOrderView> {
  return order(`/billing/orders/${id}/cancel`, { method: 'POST' }, 'billing.cancelOrder');
}

export async function getAlipayConfig(): Promise<AlipayConfigView | null> {
  return parseResponse(alipayConfigViewSchema.nullable(), await request<unknown>('/billing/alipay/config'), 'billing.alipay.get');
}
export async function saveAlipayConfig(input: AlipayConfigInput): Promise<AlipayConfigView> {
  return parseResponse(alipayConfigViewSchema, await request<unknown>('/billing/alipay/config', {
    method: 'PUT', body: JSON.stringify(input),
  }), 'billing.alipay.save');
}
export async function createPayment(input: CreatePaymentInput): Promise<PaymentView> {
  return parseResponse(paymentViewSchema, await request<unknown>('/billing/payments', {
    method: 'POST', body: JSON.stringify(input),
  }), 'billing.payment');
}
