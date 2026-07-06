import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBillingSummaryMock = vi.fn();
const listCreditAccountsMock = vi.fn();
const allocateCreditMock = vi.fn();
const rechargeCreditMock = vi.fn();
let role = 'system_admin';

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({ user: { userId: 'u1', tenantId: 't1', role, agentId: null, ownerId: null } }),
}));

vi.mock('../api/billing', () => ({
  getBillingSummary: () => getBillingSummaryMock(),
  listCreditAccounts: () => listCreditAccountsMock(),
  allocateCredit: (...args: unknown[]) => allocateCreditMock(...args),
  rechargeCredit: (...args: unknown[]) => rechargeCreditMock(...args),
}));

vi.mock('./BillingLedger', () => ({ default: () => <div>ledger-real-component</div> }));
vi.mock('./BillingPurchase', () => ({ default: () => <div>purchase-real-component</div> }));
vi.mock('./BillingPlans', () => ({ default: () => <div>plans-real-component</div> }));
vi.mock('./BillingAlipayConfig', () => ({ default: () => <div>alipay-real-component</div> }));

import BillingAdmin from './BillingAdmin';

beforeEach(() => {
  vi.clearAllMocks();
  role = 'system_admin';
  getBillingSummaryMock.mockResolvedValue({ aiBalance: 88, codeBalance: 1200 });
  listCreditAccountsMock.mockResolvedValue([
    { id: 'acc-1', ownerType: 'MERCHANT', ownerId: 'merchant-1', ownerName: 'Merchant One', aiBalance: 12, codeBalance: 30 },
  ]);
  allocateCreditMock.mockResolvedValue({ ok: true });
  rechargeCreditMock.mockResolvedValue({ ok: true });
});

describe('BillingAdmin Fluent operations', () => {
  it('renders balances, real child billing surfaces, and system recharge command', async () => {
    render(<BillingAdmin />);
    await screen.findByText('Merchant One');

    expect(screen.getByRole('heading', { name: '额度管理' })).toBeTruthy();
    expect(screen.getByText('88')).toBeTruthy();
    expect(screen.getByText('1,200')).toBeTruthy();
    expect(screen.getByText('plans-real-component')).toBeTruthy();
    expect(screen.getByText('alipay-real-component')).toBeTruthy();
    expect(screen.getByText('ledger-real-component')).toBeTruthy();
    expect(screen.getByRole('button', { name: /充值/ })).toBeTruthy();
  });

  it('submits recharge through the real billing API', async () => {
    render(<BillingAdmin />);
    await screen.findByText('Merchant One');

    fireEvent.click(screen.getByRole('button', { name: /充值/ }));
    fireEvent.change(screen.getByLabelText('充值数量'), { target: { value: '66' } });
    fireEvent.click(screen.getByRole('button', { name: /确认充值/ }));

    await waitFor(() => {
      expect(rechargeCreditMock).toHaveBeenCalledWith({ resource: 'AI', amount: 66 });
    });
    expect(getBillingSummaryMock).toHaveBeenCalledTimes(2);
    expect(listCreditAccountsMock).toHaveBeenCalledTimes(2);
  });

  it('submits allocation using the selected child account identity', async () => {
    render(<BillingAdmin />);
    await screen.findByText('Merchant One');

    fireEvent.click(screen.getByRole('button', { name: /分配/ }));
    fireEvent.change(screen.getByLabelText('分配数量'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: /确认分配/ }));

    await waitFor(() => {
      expect(allocateCreditMock).toHaveBeenCalledWith({
        targetOwnerType: 'MERCHANT',
        targetOwnerId: 'merchant-1',
        resource: 'AI',
        amount: 9,
      });
    });
  });

  it('shows purchase flow instead of platform recharge for non-system users', async () => {
    role = 'merchant';
    render(<BillingAdmin />);
    await screen.findByText('Merchant One');

    expect(screen.queryByRole('button', { name: /充值/ })).toBeNull();
    expect(screen.getByText('purchase-real-component')).toBeTruthy();
    expect(screen.queryByText('plans-real-component')).toBeNull();
    expect(screen.queryByText('alipay-real-component')).toBeNull();
  });
});
