import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecordForm from '../../src/components/RecordForm';
import WorkBatches from '../../src/pages/work/components/WorkBatches';
import WorkQuickActions from '../../src/pages/work/components/WorkQuickActions';
import { navigateTo } from '@tarojs/taro';

vi.mock('../../src/api/farm', () => ({
  createFarmRecord: vi.fn(),
  findBatchByCode: vi.fn(),
  listSupplies: vi.fn(async () => []),
  uploadImage: vi.fn(),
}));

vi.mock('../../src/api/ai', () => ({
  aiAdvice: vi.fn(),
  normalizeAiError: vi.fn(() => 'AI 暂不可用'),
  transcribeVoice: vi.fn(),
}));

describe('miniapp primary action semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Work quick actions as native buttons', () => {
    const onOpenAi = vi.fn();
    const onOpenManual = vi.fn();
    render(
      <WorkQuickActions
        templates={[]}
        aiBalance={10}
        isOffline={false}
        onOpenAi={onOpenAi}
        onOpenManual={onOpenManual}
        onOpenLocation={vi.fn()}
        onApplyTemplate={vi.fn()}
        templateStatus="success"
        templateError={null}
        onRetryTemplates={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '智能问答' }));
    fireEvent.click(screen.getByRole('button', { name: '手写农事' }));

    expect(onOpenAi).toHaveBeenCalledWith('chat');
    expect(onOpenManual).toHaveBeenCalledTimes(1);
  });

  it('exposes RecordForm selections and tools as button controls', () => {
    render(
      <RecordForm
        batches={[{
          id: 'batch-1', ownerId: 'merchant-1', fieldId: 'field-1', batchNo: 'B-001',
          cropName: '稻谷', plantDate: '2026-04-01', expectedHarvest: '2026-09-01', status: 'ACTIVE',
        }]}
        isOffline={false}
        onSaved={vi.fn()}
      />,
    );

    const batch = screen.getByRole('button', { name: /B-001.*稻谷/ });
    const watering = screen.getByRole('button', { name: '浇水' });
    fireEvent.click(batch);
    fireEvent.click(watering);

    expect(batch.getAttribute('aria-pressed')).toBe('true');
    expect(watering.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '扫描批次码' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '语音录入' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '添加现场图片' })).toBeTruthy();
  });

  it('renders Work batch cards as navigable buttons', () => {
    render(
      <WorkBatches
        batches={[{
          id: 'batch-1', ownerId: 'merchant-1', fieldId: 'field-1', batchNo: 'B-001',
          cropName: '稻谷', plantDate: '2026-04-01', expectedHarvest: '2026-09-01', status: 'ACTIVE',
        }]}
        status="success"
        error={null}
        onRetry={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /B-001.*稻谷.*查看详情/ }));

    expect(navigateTo).toHaveBeenCalledWith({
      url: '/pages/batch/index?id=batch-1&cropName=%E7%A8%BB%E8%B0%B7&batchNo=B-001',
    });
  });
});
