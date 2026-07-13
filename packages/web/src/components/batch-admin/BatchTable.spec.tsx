import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ViewBatch } from '../BatchAdmin.model';
import { BatchTable } from './BatchTable';

const batch: ViewBatch = {
  id: 'batch-1',
  fieldId: 'field-1',
  code: 'B-001',
  type: '番茄',
  date: '2026-07-01',
  house: '东区一号田',
  owner: '测试农场',
  stage: 'PLANTING',
  color: 'blue',
  inputCost: 10,
  laborCost: 20,
  sellPrice: 100,
  generated: 5,
  scanTotal: 8,
};

function renderTable() {
  const callbacks = {
    onReload: vi.fn(),
    onToggleAll: vi.fn(),
    onToggleOne: vi.fn(),
    onPage: vi.fn(),
    onDetail: vi.fn(),
    onGenerate: vi.fn(),
    onCodes: vi.fn(),
    onCompliance: vi.fn(),
    onCredentials: vi.fn(),
    onProfit: vi.fn(),
    onReport: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <BatchTable
      loading={false}
      error={null}
      filteredData={[batch]}
      pagedData={[batch]}
      selectedIds={new Set()}
      page={1}
      totalPages={1}
      exportingReportId={null}
      scanningCompliance={false}
      {...callbacks}
    />,
  );
  return callbacks;
}

describe('BatchTable responsive actions', () => {
  it('renders a semantic mobile card with primary and overflow actions', () => {
    const callbacks = renderTable();
    const list = screen.getByRole('list', { name: '批次列表' });
    const card = within(list).getByRole('listitem');

    expect(within(card).getByText('B-001')).toBeTruthy();
    expect(within(card).getByText('东区一号田')).toBeTruthy();

    fireEvent.click(within(card).getByRole('button', { name: '查看批次 B-001' }));
    fireEvent.click(within(card).getByRole('button', { name: '为批次 B-001 生码' }));
    fireEvent.click(within(card).getByRole('button', { name: '批次 B-001 更多操作' }));

    const menu = screen.getByRole('menu', { name: '批次 B-001 操作' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: '已生成码' }));

    expect(callbacks.onDetail).toHaveBeenCalledWith('batch-1');
    expect(callbacks.onGenerate).toHaveBeenCalledWith('batch-1');
    expect(callbacks.onCodes).toHaveBeenCalledWith('batch-1');
  });

  it('exposes every secondary action through the overflow menu', () => {
    renderTable();

    fireEvent.click(screen.getByRole('button', { name: '批次 B-001 更多操作' }));
    const menu = screen.getByRole('menu', { name: '批次 B-001 操作' });

    for (const label of ['已生成码', '合规', '资质', '利润', '报告', '删除']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeTruthy();
    }
  });
});
