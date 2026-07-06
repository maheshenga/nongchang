import type {
  BillingSummary, CreditAccountItem, PaginatedLedger, LedgerQuery,
  AllocateInput, RechargeInput,
  CreditPlanView, CreateCreditPlanInput, UpdateCreditPlanInput,
  CreateOrderInput, CreditOrderView, OrderQuery, PaginatedOrders,
  AlipayConfigInput, AlipayConfigView, CreatePaymentInput, PaymentView,
  ListQuery, Paginated,
} from '@nongchang/shared';
import { request } from './request';

export function getBillingSummary(): Promise<BillingSummary> {
  return request<BillingSummary>('/billing/summary');
}

function withListQuery(path: string, query: Partial<ListQuery> = {}) {
  const qs = new URLSearchParams();
  if (query.page) qs.set('page', String(query.page));
  if (query.pageSize) qs.set('pageSize', String(query.pageSize));
  const s = qs.toString();
  return `${path}${s ? `?${s}` : ''}`;
}

export function listCreditAccounts<T extends Partial<ListQuery> | undefined = undefined>(
  query?: T,
): Promise<T extends undefined ? CreditAccountItem[] : Paginated<CreditAccountItem>> {
  return request(withListQuery('/billing/accounts', query ?? {}));
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

// ── 套餐 ──
export function listCreditPlans<T extends Partial<ListQuery> | undefined = undefined>(
  query?: T,
): Promise<T extends undefined ? CreditPlanView[] : Paginated<CreditPlanView>> {
  return request(withListQuery('/billing/plans', query ?? {}));
}

export function createCreditPlan(input: CreateCreditPlanInput): Promise<CreditPlanView> {
  return request<CreditPlanView>('/billing/plans', { method: 'POST', body: JSON.stringify(input) });
}

export function updateCreditPlan(id: string, input: UpdateCreditPlanInput): Promise<CreditPlanView> {
  return request<CreditPlanView>(`/billing/plans/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function removeCreditPlan(id: string): Promise<unknown> {
  return request(`/billing/plans/${id}`, { method: 'DELETE' });
}

// ── 购买订单 ──
export function listOrders(query: Partial<OrderQuery> = {}): Promise<PaginatedOrders> {
  const qs = new URLSearchParams();
  if (query.status) qs.set('status', query.status);
  if (query.page) qs.set('page', String(query.page));
  if (query.pageSize) qs.set('pageSize', String(query.pageSize));
  const s = qs.toString();
  return request<PaginatedOrders>(`/billing/orders${s ? `?${s}` : ''}`);
}

export function createOrder(input: CreateOrderInput): Promise<CreditOrderView> {
  return request<CreditOrderView>('/billing/orders', { method: 'POST', body: JSON.stringify(input) });
}

export function payOrder(id: string): Promise<CreditOrderView> {
  return request<CreditOrderView>(`/billing/orders/${id}/pay`, { method: 'POST' });
}

export function cancelOrder(id: string): Promise<CreditOrderView> {
  return request<CreditOrderView>(`/billing/orders/${id}/cancel`, { method: 'POST' });
}

// ── 支付宝配置(SYSTEM_ADMIN) ──
export function getAlipayConfig(): Promise<AlipayConfigView | null> {
  return request<AlipayConfigView | null>('/billing/alipay/config');
}

export function saveAlipayConfig(input: AlipayConfigInput): Promise<AlipayConfigView> {
  return request<AlipayConfigView>('/billing/alipay/config', { method: 'PUT', body: JSON.stringify(input) });
}

// ── 发起真实支付 ──
export function createPayment(input: CreatePaymentInput): Promise<PaymentView> {
  return request<PaymentView>('/billing/payments', { method: 'POST', body: JSON.stringify(input) });
}
