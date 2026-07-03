import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@nongchang/shared';

const listSuppliesMock = vi.fn();
const createSupplyMock = vi.fn();
const issueSupplyMock = vi.fn();
const deleteSupplyMock = vi.fn();
const listBatchesMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('../api/supply', () => ({
  listSupplies: () => listSuppliesMock(),
  createSupply: (...args: unknown[]) => createSupplyMock(...args),
  issueSupply: (...args: unknown[]) => issueSupplyMock(...args),
  deleteSupply: (...args: unknown[]) => deleteSupplyMock(...args),
}));

vi.mock('../api/batches', () => ({
  listBatches: () => listBatchesMock(),
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => useAuthMock(),
}));

import LogisticsTracker from './LogisticsTracker';

const batchId = '11111111-1111-1111-1111-111111111111';

const supplies = [
  {
    id: 'supply-1',
    name: 'Organic fertilizer',
    unit: 'kg',
    total: 100,
    used: 20,
    remaining: 80,
    alert: false,
    createdAt: '2026-07-04T00:00:00.000Z',
  },
];

const batches = [
  {
    id: batchId,
    tenantId: 'tenant-1',
    ownerId: 'merchant-1',
    ownerName: 'Merchant One',
    fieldId: 'field-1',
    batchNo: 'BATCH-001',
    cropName: 'Peony',
    plantDate: '2026-03-01T00:00:00.000Z',
    expectedHarvest: '2026-10-01T00:00:00.000Z',
    status: 'Growing',
    createdAt: '2026-07-01T00:00:00.000Z',
    laborCost: 0,
    sellPrice: 0,
    codeCount: 0,
    scanTotal: 0,
    inputCost: 0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listSuppliesMock.mockResolvedValue(supplies);
  listBatchesMock.mockResolvedValue(batches);
  createSupplyMock.mockResolvedValue(supplies[0]);
  issueSupplyMock.mockResolvedValue({ supplyId: 'supply-1', used: 32, remaining: 68 });
  deleteSupplyMock.mockResolvedValue({ id: 'supply-1' });
  useAuthMock.mockReturnValue({ user: { role: Role.MERCHANT } });
});

describe('LogisticsTracker', () => {
  it('issues supply with the selected batch id instead of a typed batch number', async () => {
    const { container } = render(<LogisticsTracker />);
    await screen.findByText('Organic fertilizer');

    fireEvent.click(screen.getByRole('button', { name: /领用下达/ }));

    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: 'supply-1' } });
    fireEvent.change(selects[1], { target: { value: batchId } });

    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '12' } });

    fireEvent.click(screen.getByRole('button', { name: /确认下发/ }));

    await waitFor(() => {
      expect(issueSupplyMock).toHaveBeenCalledWith('supply-1', { batchId, amount: 12 });
    });
  });

  it('renders system admin supply management as read-only', async () => {
    useAuthMock.mockReturnValue({ user: { role: Role.SYSTEM_ADMIN } });

    render(<LogisticsTracker />);
    await screen.findByText('Organic fertilizer');

    expect(screen.queryByRole('button', { name: /入库登记/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /领用下达/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /删除/ })).toBeNull();
    expect(screen.getByText(/只读/)).toBeTruthy();
  });
});
