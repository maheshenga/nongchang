import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BatchAdmin from './BatchAdmin';

const batchApiMock = vi.hoisted(() => ({
  listBatches: vi.fn(),
  createBatch: vi.fn(),
  getBatchLifecycle: vi.fn(),
  deleteBatch: vi.fn(),
}));

const fieldApiMock = vi.hoisted(() => ({
  listFields: vi.fn(),
}));

const traceApiMock = vi.hoisted(() => ({
  createTraceGenerationRequestKey: vi.fn(() => 'test-key'),
  generateCodes: vi.fn(),
  listCodes: vi.fn(),
}));

vi.mock('../api/batches', () => batchApiMock);
vi.mock('../api/fields', () => fieldApiMock);
vi.mock('../api/trace', () => traceApiMock);
vi.mock('./BatchCredentialModal', () => ({ default: () => null }));

const batches = [
  {
    id: 'batch-1',
    tenantId: 'tenant-1',
    ownerId: 'owner-1',
    ownerName: '张三农场',
    fieldId: 'A区-葡萄园-01',
    batchNo: 'B20240520001',
    cropName: '阳光玫瑰葡萄',
    plantDate: '2024-05-20T09:15:00.000Z',
    expectedHarvest: '2024-07-01T00:00:00.000Z',
    status: 'Growing',
    createdAt: '2024-05-20T09:15:00.000Z',
    laborCost: 1200,
    sellPrice: 5000,
    codeCount: 10000,
    scanTotal: 2345,
    inputCost: 800,
  },
  {
    id: 'batch-2',
    tenantId: 'tenant-1',
    ownerId: 'owner-2',
    ownerName: '李四农场',
    fieldId: 'C区-樱桃园-03',
    batchNo: 'B20240518003',
    cropName: '美早樱桃',
    plantDate: '2024-05-18T09:15:00.000Z',
    expectedHarvest: '2024-06-01T00:00:00.000Z',
    status: 'Harvested',
    createdAt: '2024-05-18T09:15:00.000Z',
    laborCost: 900,
    sellPrice: 4000,
    codeCount: 5000,
    scanTotal: 5000,
    inputCost: 600,
  },
];

describe('BatchAdmin Fluent console', () => {
  beforeEach(() => {
    batchApiMock.listBatches.mockResolvedValue(batches);
    batchApiMock.getBatchLifecycle.mockResolvedValue({ farmRecords: [], traceEvents: [], codeCount: 0, scanTotal: 0 });
    fieldApiMock.listFields.mockResolvedValue([]);
    traceApiMock.generateCodes.mockResolvedValue([]);
    traceApiMock.listCodes.mockResolvedValue([]);
  });

  it('renders Fluent batch command bar and table columns', async () => {
    render(<BatchAdmin />);

    expect(await screen.findByRole('heading', { name: /批次全生命周期管理/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /新建批次/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /导出/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /筛选/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /刷新/ })).toBeTruthy();
    expect(screen.getByPlaceholderText('按批次号搜索')).toBeTruthy();
    expect(screen.getAllByRole('columnheader', { name: /批次号/ })).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: /签发码数/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /扫码量/ })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /已生成码/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /合规/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /资质/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /利润/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /报告/ })).toHaveLength(2);
  });

  it('filters visible rows by batch code', async () => {
    render(<BatchAdmin />);

    expect(await screen.findByText('B20240520001')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('按批次号搜索'), { target: { value: '18003' } });

    await waitFor(() => expect(screen.queryByText('B20240520001')).toBeNull());
    expect(screen.getByText('B20240518003')).toBeTruthy();
  });
});
