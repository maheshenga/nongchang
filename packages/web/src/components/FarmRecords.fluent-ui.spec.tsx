import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FarmRecordSource } from '@nongchang/shared';
import FarmRecords from './FarmRecords';

const apiMocks = vi.hoisted(() => ({
  listFarmRecords: vi.fn(),
  createFarmRecord: vi.fn(),
  updateFarmRecordStatus: vi.fn(),
  listBatches: vi.fn(),
  listDeviations: vi.fn(),
}));

vi.mock('../api/farm-records', () => ({
  listFarmRecords: apiMocks.listFarmRecords,
  createFarmRecord: apiMocks.createFarmRecord,
  updateFarmRecordStatus: apiMocks.updateFarmRecordStatus,
}));

vi.mock('../api/batches', () => ({ listBatches: apiMocks.listBatches }));
vi.mock('../api/phenology', () => ({ listDeviations: apiMocks.listDeviations }));

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'FarmRecords.tsx');

const records = [
  {
    id: 'rec-pending',
    tenantId: 'tenant-1',
    batchId: 'batch-1',
    fieldId: 'field-1',
    operatorId: 'operator-abcdef',
    ownerName: '大理基地',
    action: '温室浇水',
    detail: { desc: '完成 A 区滴灌', material: '水 2T', labor: 1 },
    images: [],
    location: null,
    recordedAt: '2026-07-08T08:30:00.000Z',
    source: 'WEB',
    status: 'pending',
    createdAt: '2026-07-08T08:30:00.000Z',
  },
  {
    id: 'rec-done',
    tenantId: 'tenant-1',
    batchId: 'batch-2',
    fieldId: 'field-2',
    operatorId: 'operator-ghijkl',
    ownerName: '上海基地',
    action: '采收质检',
    detail: { desc: '完成 A 级花材抽检', material: '质检表', labor: 2 },
    images: ['https://cdn.example.com/record.jpg'],
    location: null,
    recordedAt: '2026-07-07T10:00:00.000Z',
    source: 'WEB',
    status: 'completed',
    createdAt: '2026-07-07T10:00:00.000Z',
  },
];

const batches = [
  {
    id: 'batch-1',
    tenantId: 'tenant-1',
    ownerId: 'owner-1',
    ownerName: '大理基地',
    fieldId: 'field-1',
    batchNo: 'PA-2026-001',
    cropName: '白芍',
    plantDate: '2026-01-01T00:00:00.000Z',
    expectedHarvest: '2026-09-01T00:00:00.000Z',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    laborCost: 0,
    sellPrice: 0,
    codeCount: 0,
    scanTotal: 0,
    inputCost: 0,
  },
];

describe('FarmRecords Fluent UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.listFarmRecords.mockResolvedValue(records);
    apiMocks.listBatches.mockResolvedValue(batches);
    apiMocks.listDeviations.mockResolvedValue([]);
    apiMocks.createFarmRecord.mockResolvedValue(records[0]);
    apiMocks.updateFarmRecordStatus.mockResolvedValue({ ...records[0], status: 'completed' });
  });

  it('keeps the source inside the Fluent UI boundary', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain('fluentButton');
    expect(source).toContain('fluentInput');
    expect(source).toContain('fluentSelect');
    expect(source).toContain('LoadingState');
    expect(source).toContain('ErrorState');
    expect(source).toContain('EmptyState');
    expect(source).toContain('fluentStatusTag');
    const forbiddenClassTokens = [
      'text-slate-',
      'bg-slate-',
      'border-slate-',
      'ring-slate-',
      'text-emerald-',
      'bg-emerald-',
      'border-emerald-',
      'hover:bg-emerald-',
      'focus:ring-emerald-',
      'text-rose-',
      'bg-rose-',
      'border-rose-',
      'rounded-2xl',
      'rounded-xl',
      'rounded-lg',
      'shadow-xl',
      'shadow-2xl',
    ];
    for (const token of forbiddenClassTokens) {
      expect(source).not.toContain(token);
    }
  });

  it('filters records, completes a pending record, and creates a real farm record payload', async () => {
    render(<FarmRecords />);

    expect(await screen.findByText('温室浇水')).toBeTruthy();
    expect(screen.getByText('采收质检')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('按作业类型搜索'), { target: { value: ' 浇水 ' } });
    fireEvent.change(screen.getByLabelText('状态筛选'), { target: { value: 'pending' } });
    fireEvent.click(screen.getByRole('button', { name: '筛选' }));

    await waitFor(() => {
      expect(apiMocks.listFarmRecords).toHaveBeenCalledWith({ action: '浇水', status: 'pending' });
    });

    fireEvent.click(screen.getByRole('button', { name: '标记完成 温室浇水' }));
    await waitFor(() => expect(apiMocks.updateFarmRecordStatus).toHaveBeenCalledWith('rec-pending', 'completed'));
    expect(await screen.findByText('已完成并发布到公开溯源')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '快捷农事实录' }));
    fireEvent.change(await screen.findByLabelText('关联批次'), { target: { value: 'batch-1' } });
    fireEvent.change(screen.getByLabelText('作业类型'), { target: { value: ' 施肥 ' } });
    fireEvent.change(screen.getByLabelText('执行描述'), { target: { value: ' 追施有机肥 ' } });
    fireEvent.change(screen.getByLabelText('物料消耗'), { target: { value: ' 有机肥 20kg ' } });
    fireEvent.change(screen.getByLabelText('预估工时'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: '保存记录' }));

    await waitFor(() => {
      expect(apiMocks.createFarmRecord).toHaveBeenCalledWith(expect.objectContaining({
        batchId: 'batch-1',
        fieldId: 'field-1',
        action: ' 施肥 ',
        detail: { desc: ' 追施有机肥 ', material: ' 有机肥 20kg ', labor: 2.5 },
        source: FarmRecordSource.WEB,
        status: 'pending',
      }));
    });
    expect(apiMocks.createFarmRecord.mock.calls[0][0].recordedAt).toEqual(expect.any(String));
  });
});
