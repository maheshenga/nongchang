import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreditOrderView, CreditPlanView } from '@nongchang/shared';

const billingApiMock = vi.hoisted(() => ({
  listCreditPlans: vi.fn(),
  listOrders: vi.fn(),
  createOrder: vi.fn(),
  createPayment: vi.fn(),
  cancelOrder: vi.fn(),
}));

const alipayMock = vi.hoisted(() => ({
  redirectToAlipayUrl: vi.fn(),
  submitAlipayForm: vi.fn(),
}));

vi.mock('../api/billing', () => billingApiMock);
vi.mock('../utils/alipay-form', () => alipayMock);

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import BillingPurchase from './BillingPurchase';

const __dirname = dirname(fileURLToPath(import.meta.url));

const plans: CreditPlanView[] = [
  {
    id: 'plan-ai-100',
    name: 'AI Pack 100',
    resource: 'AI',
    quantity: 100,
    priceCents: 1000,
    isUnit: false,
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'plan-code-unit',
    name: 'Code Unit',
    resource: 'CODE',
    quantity: 1,
    priceCents: 20,
    isUnit: true,
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
];

const pendingOrder: CreditOrderView = {
  id: 'order-pending-1',
  ownerId: 'owner-1',
  ownerType: 'MERCHANT',
  planId: 'plan-ai-100',
  planName: 'AI Pack 100',
  resource: 'AI',
  quantity: 100,
  amountCents: 1000,
  status: 'PENDING',
  paidAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  billingApiMock.listCreditPlans.mockResolvedValue(plans);
  billingApiMock.listOrders.mockResolvedValue({ items: [pendingOrder], total: 1, page: 1, pageSize: 20 });
  billingApiMock.createOrder.mockResolvedValue({ ...pendingOrder, id: 'order-created-1' });
  billingApiMock.createPayment.mockResolvedValue({ orderId: 'order-created-1', payUrl: 'https://pay.example/alipay', formHtml: null });
  billingApiMock.cancelOrder.mockResolvedValue({ ...pendingOrder, status: 'CANCELLED' });
  Object.defineProperty(window.navigator, 'userAgent', { value: 'Desktop Chrome', configurable: true });
});

describe('BillingPurchase purchase flow', () => {
  it('creates an order, creates a PC payment, and redirects for a fixed plan purchase', async () => {
    render(<BillingPurchase />);

    await screen.findAllByText('AI Pack 100');
    const purchaseButton = screen.getAllByRole('button', { name: /购买/ })[0];

    fireEvent.click(purchaseButton);

    await waitFor(() => {
      expect(billingApiMock.createOrder).toHaveBeenCalledWith({ planId: 'plan-ai-100' });
      expect(billingApiMock.createPayment).toHaveBeenCalledWith({ orderId: 'order-created-1', channel: 'PC' });
      expect(alipayMock.redirectToAlipayUrl).toHaveBeenCalledWith('https://pay.example/alipay');
    });
    expect(alipayMock.submitAlipayForm).not.toHaveBeenCalled();
  });

  it('retries payment for pending orders and can cancel them', async () => {
    render(<BillingPurchase />);
    await screen.findAllByText('AI Pack 100');

    const orderRow = screen.getAllByText('AI Pack 100').find((node) => node.closest('tr'))?.closest('tr');
    expect(orderRow).toBeTruthy();
    const rowButtons = within(orderRow as HTMLElement).getAllByRole('button');

    fireEvent.click(rowButtons[0]);
    await waitFor(() => {
      expect(billingApiMock.createPayment).toHaveBeenCalledWith({ orderId: 'order-pending-1', channel: 'PC' });
    });

    const listOrderCallsBeforeCancel = billingApiMock.listOrders.mock.calls.length;

    fireEvent.click(rowButtons[1]);
    await waitFor(() => {
      expect(billingApiMock.cancelOrder).toHaveBeenCalledWith('order-pending-1');
      expect(billingApiMock.listOrders.mock.calls.length).toBeGreaterThan(listOrderCallsBeforeCancel);
    });
  });

  it('uses shared Fluent primitives instead of the legacy emerald/slate card style', () => {
    const source = readFileSync(resolve(__dirname, 'BillingPurchase.tsx'), 'utf8');

    expect(source).toContain("from '../ui/fluent'");
    expect(source).toContain('fluentButton(');
    expect(source).toContain('fluentInput');
    expect(source).toContain('fluentTable');
    expect(source).not.toContain('rounded-xl');
    expect(source).not.toContain('bg-emerald-600');
    expect(source).not.toContain('hover:bg-emerald-700');
    expect(source).not.toContain('border-slate');
    expect(source).not.toContain('text-slate');
    expect(source).not.toContain('bg-slate');
  });
});
