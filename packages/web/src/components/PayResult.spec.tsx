import { act, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { CreditOrderView } from '@nongchang/shared';

const getOrderMock = vi.fn();

vi.mock('../api/billing', () => ({
  getOrder: (id: string) => getOrderMock(id),
}));

import PayResult from './PayResult';

function order(status: CreditOrderView['status']): CreditOrderView {
  return {
    id: 'order-1',
    ownerType: 'MERCHANT',
    ownerId: 'merchant-1',
    planId: null,
    planName: null,
    resource: 'CODE',
    quantity: 100,
    amountCents: 990,
    status,
    paidAt: status === 'PAID' ? '2026-07-07T00:00:00.000Z' : null,
    createdAt: '2026-07-07T00:00:00.000Z',
  };
}

describe('PayResult', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getOrderMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('polls the order until Alipay callback marks it paid', async () => {
    getOrderMock
      .mockResolvedValueOnce(order('PENDING'))
      .mockResolvedValueOnce(order('PAID'));

    render(<PayResult orderId="order-1" onBack={vi.fn()} />);

    expect(screen.getByText('正在确认支付结果')).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByText('支付成功')).toBeTruthy();
    expect(getOrderMock).toHaveBeenCalledTimes(2);
    expect(getOrderMock).toHaveBeenCalledWith('order-1');
  });

  it('keeps polling for 60 seconds before showing manual verification guidance', async () => {
    getOrderMock.mockResolvedValue(order('PENDING'));

    render(<PayResult orderId="order-1" onBack={vi.fn()} />);

    expect(screen.getByText('正在确认支付结果')).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(58_000);
    });

    expect(screen.queryByText('尚未确认到账')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(screen.getByText('尚未确认到账')).toBeTruthy();
  });
});
