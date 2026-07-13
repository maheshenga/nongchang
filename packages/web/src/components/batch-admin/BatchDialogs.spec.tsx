import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BatchAnalysisDialogs } from './BatchAnalysisDialogs';
import { BatchDeleteDialog } from './BatchDeleteDialog';

describe('batch modal safety', () => {
  it('renders delete confirmation through the portal and blocks Escape while deleting', () => {
    const onClose = vi.fn();
    const view = render(
      <BatchDeleteDialog
        target={{ id: 'b1', label: 'B-001', generated: 0 }}
        forceConfirm={false}
        deleting
        onForceConfirm={vi.fn()}
        onClose={onClose}
        onDelete={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '删除批次' });
    expect(view.container.contains(dialog)).toBe(false);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders pending generation confirmation as a named dialog', () => {
    const view = render(
      <BatchAnalysisDialogs
        batches={[]}
        profitBatchId={null}
        complianceBatchId={null}
        compliance={null}
        pending={{
          type: 'generate',
          title: '生成标签',
          description: '扣除 10 个额度',
          affectedCount: 10,
          onConfirm: vi.fn(),
        }}
        busy={false}
        onCloseProfit={vi.fn()}
        onCloseCompliance={vi.fn()}
        onClosePending={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '生成标签' });
    expect(view.container.contains(dialog)).toBe(false);
    expect(screen.getByText('影响范围: 10 个')).toBeTruthy();
  });
});
