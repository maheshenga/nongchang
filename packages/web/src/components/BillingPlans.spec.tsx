import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CreditPlanView } from '@nongchang/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listCreditPlansMock = vi.fn();
const createCreditPlanMock = vi.fn();
const updateCreditPlanMock = vi.fn();
const removeCreditPlanMock = vi.fn();

vi.mock('../api/billing', () => ({
  listCreditPlans: (...args: unknown[]) => listCreditPlansMock(...args),
  createCreditPlan: (...args: unknown[]) => createCreditPlanMock(...args),
  updateCreditPlan: (...args: unknown[]) => updateCreditPlanMock(...args),
  removeCreditPlan: (...args: unknown[]) => removeCreditPlanMock(...args),
}));

import BillingPlans from './BillingPlans';

const plans: CreditPlanView[] = [
  {
    id: 'plan-1',
    name: 'AI Pack',
    resource: 'AI',
    quantity: 100,
    priceCents: 1000,
    isUnit: false,
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listCreditPlansMock.mockResolvedValue({ items: plans, total: 201, page: 1, pageSize: 50 });
  createCreditPlanMock.mockResolvedValue(plans[0]);
  updateCreditPlanMock.mockResolvedValue(plans[0]);
  removeCreditPlanMock.mockResolvedValue({ ok: true });
});

describe('BillingPlans pagination', () => {
  it('loads paginated plan pages so later plans remain reachable', async () => {
    listCreditPlansMock.mockImplementation((query: { page: number; pageSize: number }) => Promise.resolve({
      items: plans,
      total: 201,
      page: query.page,
      pageSize: query.pageSize,
    }));

    render(<BillingPlans />);
    await screen.findByText('第 1 / 5 页');

    expect(listCreditPlansMock).toHaveBeenCalledWith({ page: 1, pageSize: 50 });

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => {
      expect(listCreditPlansMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 50 });
    });
    expect(await screen.findByText('第 2 / 5 页')).toBeTruthy();
  });

  it('debounces plan name search into the server query', async () => {
    render(<BillingPlans />);
    await screen.findByText('AI Pack');

    fireEvent.change(screen.getByPlaceholderText('搜索套餐名称'), { target: { value: '基础' } });

    await waitFor(() => {
      expect(listCreditPlansMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 50, search: '基础' });
    });
  });
});
