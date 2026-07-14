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
  it('defaults to one code and asks for confirmation before generation', () => {
    const onGenerate = vi.fn();
    const requestConfirmation = vi.fn();
    render(
      <BatchLabelWorkspace
        batch={batch}
        codeBalance={50}
        quotaLoading={false}
        quotaError={null}
        billingAvailable
        generating={false}
        onGenerate={onGenerate}
        requestConfirmation={requestConfirmation}
        onOpenBilling={vi.fn()}
        onRetryQuota={vi.fn()}
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
    expect(screen.getByText('本次申请 1')).toBeTruthy();
    expect(screen.getByText('预计剩余 49')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '生成真实溯源码' }));

    expect(requestConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      affectedCount: 1,
      description: expect.stringContaining('批次 B-001（番茄，东区一号田）'),
    }));
    expect(requestConfirmation.mock.calls[0][0].description).toContain('生成 1 枚唯一溯源码');
    expect(requestConfirmation.mock.calls[0][0].description).not.toContain('batch-internal-id');
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('blocks generation beyond the known balance', () => {
    const onOpenBilling = vi.fn();
    render(
      <BatchLabelWorkspace
        batch={batch}
        codeBalance={50}
        quotaLoading={false}
        quotaError={null}
        billingAvailable
        generating={false}
        onGenerate={vi.fn()}
        requestConfirmation={vi.fn()}
        onOpenBilling={onOpenBilling}
        onRetryQuota={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('预设批量总数'), { target: { value: '60' } });
    expect(screen.getByText('预计剩余 -10（额度不足）')).toBeTruthy();
    expect((screen.getByRole('button', { name: '生成真实溯源码' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '前往计费中心' }));
    expect(onOpenBilling).toHaveBeenCalledTimes(1);
  });

  it('blocks generation while quota is loading', () => {
    render(
      <BatchLabelWorkspace
        batch={batch}
        codeBalance={null}
        quotaLoading
        quotaError={null}
        billingAvailable={false}
        generating={false}
        onGenerate={vi.fn()}
        requestConfirmation={vi.fn()}
        onOpenBilling={vi.fn()}
        onRetryQuota={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('额度加载中')).toBeTruthy();
    expect(screen.getByText('当前额度 加载中')).toBeTruthy();
    expect((screen.getByRole('button', { name: '生成真实溯源码' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a retry action when quota loading fails', () => {
    const onRetryQuota = vi.fn();
    render(
      <BatchLabelWorkspace
        batch={batch}
        codeBalance={null}
        quotaLoading={false}
        quotaError="额度余额加载失败"
        billingAvailable={false}
        generating={false}
        onGenerate={vi.fn()}
        requestConfirmation={vi.fn()}
        onOpenBilling={vi.fn()}
        onRetryQuota={onRetryQuota}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('额度余额加载失败');
    expect((screen.getByRole('button', { name: '生成真实溯源码' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '重试额度' }));
    expect(onRetryQuota).toHaveBeenCalledTimes(1);
  });

  it('blocks generation when quota is unavailable without a known balance', () => {
    const requestConfirmation = vi.fn();
    render(
      <BatchLabelWorkspace
        batch={batch}
        codeBalance={null}
        quotaLoading={false}
        quotaError={null}
        billingAvailable={false}
        generating={false}
        onGenerate={vi.fn()}
        requestConfirmation={requestConfirmation}
        onOpenBilling={vi.fn()}
        onRetryQuota={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('当前额度 暂不可用')).toBeTruthy();
    expect(screen.getByText('预计剩余 暂不可用')).toBeTruthy();
    expect((screen.getByRole('button', { name: '生成真实溯源码' }) as HTMLButtonElement).disabled).toBe(true);
    expect(requestConfirmation).not.toHaveBeenCalled();
  });

  it('rejects fractional generation quantities instead of rounding them', () => {
    const requestConfirmation = vi.fn();
    render(
      <BatchLabelWorkspace
        batch={batch}
        codeBalance={50}
        quotaLoading={false}
        quotaError={null}
        billingAvailable={false}
        generating={false}
        onGenerate={vi.fn()}
        requestConfirmation={requestConfirmation}
        onOpenBilling={vi.fn()}
        onRetryQuota={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('预设批量总数'), { target: { value: '1.5' } });
    expect(screen.getByText('生成数量须为 1 到 10000 的整数')).toBeTruthy();
    expect((screen.getByRole('button', { name: '生成真实溯源码' }) as HTMLButtonElement).disabled).toBe(true);
    expect(requestConfirmation).not.toHaveBeenCalled();
  });
});
