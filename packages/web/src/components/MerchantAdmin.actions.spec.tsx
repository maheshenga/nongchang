import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogHost } from '../hooks/useDialog';
import { resetAppQueryCache } from '../query-client';

const listBatchesMock = vi.fn();
const listFieldsMock = vi.fn();
const getBillingSummaryMock = vi.fn();
const generateCodesMock = vi.fn();
const createTraceGenerationRequestKeyMock = vi.fn();

vi.mock('../api/batches', () => ({
  listBatches: () => listBatchesMock(),
}));

vi.mock('../api/fields', () => ({
  listFields: () => listFieldsMock(),
}));

vi.mock('../api/billing', () => ({
  getBillingSummary: () => getBillingSummaryMock(),
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
  codeCount: 7,
  scanTotal: 0,
  inputCost: 0,
};

const renderArchive = (onNavigate = vi.fn()) => render(
  <>
    <MerchantAdmin onNavigate={onNavigate} />
    <DialogHost />
  </>,
);

beforeEach(async () => {
  await resetAppQueryCache();
  vi.clearAllMocks();
  listBatchesMock.mockResolvedValue([batch]);
  listFieldsMock.mockResolvedValue([{ id: 'field-1', name: '东区一号田' }]);
  getBillingSummaryMock.mockResolvedValue({ aiBalance: 100, codeBalance: 50 });
  generateCodesMock.mockResolvedValue([{ code: 'TRACE-001' }]);
  let requestKeySeq = 0;
  createTraceGenerationRequestKeyMock.mockImplementation((source: string, batchId: string, count: number) => {
    requestKeySeq += 1;
    return `${source}:${batchId}:${count}:test-key-${requestKeySeq}`;
  });
});

describe('MerchantAdmin production actions', () => {
  it('routes batch creation and generic batch management to the real batch page', async () => {
    const onNavigate = vi.fn();
    renderArchive(onNavigate);
    await screen.findAllByText('Peony');

    fireEvent.click(screen.getByRole('button', { name: '新增生产批次' }));
    fireEvent.click(screen.getAllByRole('button', { name: '进入批次管理 BATCH-001' })[0]);

    expect(onNavigate).toHaveBeenNthCalledWith(1, 'batches');
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'batches');
  });

  it('exposes responsive product records with the same safe label command', async () => {
    renderArchive();
    await screen.findAllByText('Peony');

    expect(screen.getByRole('list', { name: '产品档案列表' })).toBeTruthy();
    expect(screen.getByRole('listitem', { name: '产品档案 BATCH-001' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '配置溯源标签 BATCH-001' })).toHaveLength(2);
    expect(screen.getAllByText('7')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /打印追溯标签/ })).toBeNull();
    expect(generateCodesMock).not.toHaveBeenCalled();
  });

  it('opens the shared workspace and confirms before generating one code', async () => {
    renderArchive();
    await screen.findAllByText('Peony');

    fireEvent.click(screen.getAllByRole('button', { name: '配置溯源标签 BATCH-001' })[0]);
    expect(screen.getByRole('dialog', { name: '溯源码标签配置' })).toBeTruthy();
    expect(screen.getByText('东区一号田')).toBeTruthy();
    expect(screen.getByText('本次申请 1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '生成真实溯源码' }));
    expect(generateCodesMock).not.toHaveBeenCalled();

    const confirmation = await screen.findByRole('dialog', { name: '批量生成并导出溯源标签矩阵' });
    fireEvent.click(within(confirmation).getByRole('button', { name: '确认生成' }));

    await waitFor(() => {
      expect(generateCodesMock).toHaveBeenCalledWith('batch-1', 1, expect.any(String));
    });
    expect(createTraceGenerationRequestKeyMock).toHaveBeenCalledWith('product-archive-label', 'batch-1', 1);
    expect(await screen.findByRole('dialog', { name: '标签打印预览' })).toBeTruthy();
  });

  it('reuses the product-archive request key after a failed confirmed generation', async () => {
    generateCodesMock
      .mockRejectedValueOnce(new Error('confirm down'))
      .mockResolvedValueOnce([{ code: 'TRACE-001' }]);
    renderArchive();
    await screen.findAllByText('Peony');

    fireEvent.click(screen.getAllByRole('button', { name: '配置溯源标签 BATCH-001' })[0]);
    const generateButton = screen.getByRole('button', { name: '生成真实溯源码' });

    fireEvent.click(generateButton);
    fireEvent.click(within(await screen.findByRole('dialog', { name: '批量生成并导出溯源标签矩阵' })).getByRole('button', { name: '确认生成' }));
    await waitFor(() => expect(generateCodesMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((generateButton as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(generateButton);
    fireEvent.click(within(await screen.findByRole('dialog', { name: '批量生成并导出溯源标签矩阵' })).getByRole('button', { name: '确认生成' }));
    await waitFor(() => expect(generateCodesMock).toHaveBeenCalledTimes(2));

    expect(generateCodesMock.mock.calls[1][2]).toBe(generateCodesMock.mock.calls[0][2]);
    expect(createTraceGenerationRequestKeyMock).toHaveBeenCalledTimes(1);
  });
});
