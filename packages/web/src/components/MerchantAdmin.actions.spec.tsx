import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listBatchesMock = vi.fn();
const generateCodesMock = vi.fn();
const createTraceGenerationRequestKeyMock = vi.fn();

vi.mock('../api/batches', () => ({
  listBatches: () => listBatchesMock(),
}));

vi.mock('../api/trace', () => ({
  createTraceGenerationRequestKey: (...args: unknown[]) => createTraceGenerationRequestKeyMock(...args),
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

function getCreateBatchButton(container: HTMLElement): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'));
  const button = buttons.find((item) => item.className.includes('bg-emerald-600') && !item.className.includes('w-full'));
  if (!(button instanceof HTMLButtonElement)) throw new Error('create batch button not found');
  return button;
}

function getSidePanelGenerateButton(container: HTMLElement): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'));
  const button = buttons.find((item) => item.className.includes('w-full bg-emerald-600'));
  if (!(button instanceof HTMLButtonElement)) throw new Error('side panel generate button not found');
  return button;
}

beforeEach(() => {
  vi.clearAllMocks();
  listBatchesMock.mockResolvedValue([batch]);
  generateCodesMock.mockResolvedValue([{ code: 'TRACE-001' }]);
  let requestKeySeq = 0;
  createTraceGenerationRequestKeyMock.mockImplementation((source: string, batchId: string, count: number) => {
    requestKeySeq += 1;
    return `${source}:${batchId}:${count}:test-key-${requestKeySeq}`;
  });
});

describe('MerchantAdmin production actions', () => {
  it('routes batch creation to the real batch page', async () => {
    const onNavigate = vi.fn();
    const { container } = render(<MerchantAdmin onNavigate={onNavigate} />);
    await screen.findByText('Peony');

    fireEvent.click(getCreateBatchButton(container));

    expect(onNavigate).toHaveBeenCalledWith('batches');
  });

  it('generates trace codes through the real API from the side panel', async () => {
    const { container } = render(<MerchantAdmin />);
    await screen.findByText('Peony');

    fireEvent.click(screen.getByText('Peony'));
    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '5' } });
    fireEvent.click(getSidePanelGenerateButton(container));

    await waitFor(() => {
      expect(generateCodesMock).toHaveBeenCalledWith('batch-1', 5, expect.any(String));
    });
    expect(listBatchesMock).toHaveBeenCalledTimes(2);
  });

  it('reuses the same request key when side panel generation is retried after failure', async () => {
    generateCodesMock
      .mockRejectedValueOnce(new Error('confirm down'))
      .mockResolvedValueOnce([{ code: 'TRACE-001' }]);
    const { container } = render(<MerchantAdmin />);
    await screen.findByText('Peony');

    fireEvent.click(screen.getByText('Peony'));
    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '5' } });
    const generateButton = getSidePanelGenerateButton(container);
    fireEvent.click(generateButton);
    await waitFor(() => expect(generateCodesMock).toHaveBeenCalledTimes(1));

    fireEvent.click(generateButton);
    await waitFor(() => expect(generateCodesMock).toHaveBeenCalledTimes(2));

    expect(generateCodesMock.mock.calls[1][2]).toBe(generateCodesMock.mock.calls[0][2]);
  });

  it('shows existing code count and blocks invalid generation amounts', async () => {
    listBatchesMock.mockResolvedValue([{ ...batch, codeCount: 7 }]);
    const { container } = render(<MerchantAdmin />);
    await screen.findByText('Peony');

    expect(container.textContent).toContain('7');
    fireEvent.click(screen.getByText('Peony'));
    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '1.5' } });
    fireEvent.click(getSidePanelGenerateButton(container));

    expect(generateCodesMock).not.toHaveBeenCalled();
  });

  it('does not show local completion toasts for unavailable actions', async () => {
    const { container } = render(<MerchantAdmin />);
    await screen.findByText('Peony');
    fireEvent.click(screen.getByText('Peony'));

    expect(container.textContent).not.toContain('pending backend integration');
    const warehouseDocumentButton = screen.getByRole('button', { name: /出入库单未开放/ });
    expect((warehouseDocumentButton as HTMLButtonElement).disabled).toBe(true);
    const disabledButtons = Array.from(container.querySelectorAll('button:disabled'));
    expect(disabledButtons.length).toBeGreaterThanOrEqual(3);
  });

  it('marks lifecycle trace archive as unavailable', async () => {
    render(<MerchantAdmin />);
    await screen.findByText('Peony');

    const archiveButton = screen.getByRole('button', { name: 'Lifecycle trace archive unavailable' });
    expect((archiveButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('prints trace labels without unsupported certification or cryptographic claims', async () => {
    const { container } = render(<MerchantAdmin />);
    await screen.findByText('Peony');

    fireEvent.click(screen.getByText('Peony'));
    fireEvent.click(screen.getByRole('button', { name: /打印追溯标签/ }));

    await screen.findByRole('dialog', { name: '溯源码标签打印预览' });

    expect(generateCodesMock).toHaveBeenCalledWith('batch-1', 1, expect.any(String));
    expect(container.textContent).toContain('TRACE-001');
    expect(container.textContent).toContain('扫码查看该批次已登记的溯源信息');
    expect(container.textContent).not.toContain('权威质检');
    expect(container.textContent).not.toContain('PASSED');
    expect(container.textContent).not.toContain('zero-knowledge');
    expect(container.textContent).not.toContain('OAUTH');
    expect(container.textContent).not.toContain('地理标志');
    expect(container.textContent).not.toContain('源头温室棚室标识');
    expect(container.textContent).not.toContain('花卉品种品系级别');
  });
});
