import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ViewBatch } from '../BatchAdmin.model';
import { BatchLabelWorkspace } from './BatchLabelWorkspace';

const batch: ViewBatch = {
  id: 'batch-internal-id',
  fieldId: 'field-1',
  code: 'B-001',
  type: '番茄',
  date: '2026-07-01',
  house: '东区一号田',
  owner: '测试农场',
  stage: 'Growing',
  color: 'green',
  inputCost: 0,
  laborCost: 0,
  sellPrice: 0,
  generated: 0,
  scanTotal: 0,
};

describe('BatchLabelWorkspace quota boundary', () => {
  it('shows real quota math and blocks generation beyond balance', () => {
    const onOpenBilling = vi.fn();
    const requestConfirmation = vi.fn();
    render(
      <BatchLabelWorkspace
        batch={batch}
        codeBalance={50}
        billingAvailable
        generating={false}
        onGenerate={vi.fn()}
        requestConfirmation={requestConfirmation}
        onOpenBilling={onOpenBilling}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '溯源码标签配置' });
    expect(dialog.closest('[data-modal-layer="true"]')?.parentElement).toBe(document.body);
    expect(screen.getByText('B-001')).toBeTruthy();
    expect(screen.getByText('番茄')).toBeTruthy();
    expect(screen.getByText('东区一号田')).toBeTruthy();
    expect(screen.getByText('每生成 1 枚溯源码扣减 1 个二维码额度')).toBeTruthy();
    expect(screen.getByText('当前额度 50')).toBeTruthy();
    expect(screen.getByText('本次申请 100')).toBeTruthy();
    expect(screen.getByText('预计剩余 -50（额度不足）')).toBeTruthy();
    expect((screen.getByRole('button', { name: '生成真实溯源码' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '前往计费中心' }));
    expect(onOpenBilling).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('预设批量总数'), { target: { value: '20' } });
    expect(screen.getByText('预计剩余 30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '生成真实溯源码' }));
    expect(requestConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining('批次 B-001（番茄，东区一号田）'),
    }));
    expect(requestConfirmation.mock.calls[0][0].description).not.toContain('batch-internal-id');
  });

  it('labels unavailable quota without inventing a balance', () => {
    render(
      <BatchLabelWorkspace
        batch={batch}
        codeBalance={null}
        billingAvailable={false}
        generating={false}
        onGenerate={vi.fn()}
        requestConfirmation={vi.fn()}
        onOpenBilling={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('当前额度 暂不可用')).toBeTruthy();
    expect(screen.getByText('预计剩余 暂不可用')).toBeTruthy();
  });
});
