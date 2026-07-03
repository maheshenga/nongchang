import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listBatchesMock = vi.fn();
const generateCodesMock = vi.fn();

vi.mock('../api/batches', () => ({
  listBatches: () => listBatchesMock(),
}));

vi.mock('../api/trace', () => ({
  generateCodes: (...args: unknown[]) => generateCodesMock(...args),
}));

import MerchantAdmin from './MerchantAdmin';

const batch = {
  id: 'batch-1',
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
};

beforeEach(() => {
  vi.clearAllMocks();
  listBatchesMock.mockResolvedValue([batch]);
  generateCodesMock.mockResolvedValue([{ code: 'TRACE-001' }]);
});

describe('MerchantAdmin production actions', () => {
  it('routes batch creation to the real batch page', async () => {
    const onNavigate = vi.fn();
    render(<MerchantAdmin onNavigate={onNavigate} />);
    await screen.findByText('Peony');

    fireEvent.click(screen.getByRole('button', { name: /新增.*生产批次/ }));

    expect(onNavigate).toHaveBeenCalledWith('batches');
  });

  it('generates trace codes through the real API from the side panel', async () => {
    const { container } = render(<MerchantAdmin />);
    await screen.findByText('Peony');

    fireEvent.click(screen.getByText('Peony'));
    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /生成溯源码/ }));

    await waitFor(() => {
      expect(generateCodesMock).toHaveBeenCalledWith('batch-1', 5);
    });
    expect(listBatchesMock).toHaveBeenCalledTimes(2);
  });

  it('shows existing code count and blocks invalid generation amounts', async () => {
    listBatchesMock.mockResolvedValue([{ ...batch, codeCount: 7 }]);
    const { container } = render(<MerchantAdmin />);
    await screen.findByText('Peony');

    expect(screen.getByText(/7\s*张/)).toBeTruthy();
    fireEvent.click(screen.getByText('Peony'));
    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: /生成溯源码/ }));

    expect(generateCodesMock).not.toHaveBeenCalled();
  });

  it('does not show local completion toasts for unavailable actions', async () => {
    render(<MerchantAdmin />);
    await screen.findByText('Peony');
    fireEvent.click(screen.getByText('Peony'));

    expect(screen.queryByText(/待后端接入/)).toBeNull();
    expect(screen.getByRole('button', { name: /模板定制未开通/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /到批次管理流转/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /到批次管理删除/ })).toHaveProperty('disabled', true);
  });
});
