import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { QuickTemplateView } from '@nongchang/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listQuickTemplatesMock = vi.fn();
const createQuickTemplateMock = vi.fn();
const updateQuickTemplateMock = vi.fn();
const deleteQuickTemplateMock = vi.fn();

vi.mock('../api/quick-template', () => ({
  listQuickTemplates: () => listQuickTemplatesMock(),
  createQuickTemplate: (...args: unknown[]) => createQuickTemplateMock(...args),
  updateQuickTemplate: (...args: unknown[]) => updateQuickTemplateMock(...args),
  deleteQuickTemplate: (...args: unknown[]) => deleteQuickTemplateMock(...args),
}));

import QuickTemplates from './QuickTemplates';
import { DialogHost } from '../hooks/useDialog';

const templates: QuickTemplateView[] = [
  {
    id: 'tpl-1',
    name: 'Watering',
    action: 'Irrigate',
    note: 'Drip irrigation 30 minutes',
    cost: 12.5,
    labor: 0.5,
    sort: 3,
    createdAt: '2026-07-08T00:00:00.000Z',
  },
];

const renderWithDialog = () => render(<><QuickTemplates /><DialogHost /></>);

beforeEach(() => {
  vi.clearAllMocks();
  listQuickTemplatesMock.mockResolvedValue(templates);
  createQuickTemplateMock.mockResolvedValue(templates[0]);
  updateQuickTemplateMock.mockResolvedValue(templates[0]);
  deleteQuickTemplateMock.mockResolvedValue({ ok: true });
});

describe('QuickTemplates Fluent management', () => {
  it('renders templates in a compact Fluent table surface', async () => {
    renderWithDialog();

    await screen.findByText('Watering');

    expect(screen.getByRole('heading', { name: '快捷模板' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新建模板' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '名称' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '农事动作' })).toBeTruthy();
    expect(screen.getByRole('table').parentElement?.className).toContain('border-[#E1DFDD]');
  });

  it('creates a template through the real API wrapper payload', async () => {
    listQuickTemplatesMock.mockResolvedValueOnce([]).mockResolvedValueOnce(templates);
    renderWithDialog();

    await screen.findByText('暂无模板');
    fireEvent.click(screen.getByRole('button', { name: '新建模板' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '  Fertilize  ' } });
    fireEvent.change(screen.getByLabelText('农事动作'), { target: { value: '  Apply fertilizer  ' } });
    fireEvent.change(screen.getByLabelText('预设备注(可选)'), { target: { value: '  Use organic mix  ' } });
    fireEvent.change(screen.getByLabelText('成本(元)'), { target: { value: '18.25' } });
    fireEvent.change(screen.getByLabelText('工时(天)'), { target: { value: '0.75' } });
    fireEvent.change(screen.getByLabelText('排序'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(createQuickTemplateMock).toHaveBeenCalledWith({
        name: 'Fertilize',
        action: 'Apply fertilizer',
        note: 'Use organic mix',
        cost: 18.25,
        labor: 0.75,
        sort: 7,
      });
    });
    expect(listQuickTemplatesMock).toHaveBeenCalledTimes(2);
  });

  it('updates an existing template through the real API wrapper payload', async () => {
    renderWithDialog();

    await screen.findByText('Watering');
    fireEvent.click(screen.getByRole('button', { name: '编辑 Watering' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Watering updated' } });
    fireEvent.change(screen.getByLabelText('排序'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(updateQuickTemplateMock).toHaveBeenCalledWith('tpl-1', {
        name: 'Watering updated',
        action: 'Irrigate',
        note: 'Drip irrigation 30 minutes',
        cost: 12.5,
        labor: 0.5,
        sort: 9,
      });
    });
  });

  it('does not delete when destructive confirmation is cancelled', async () => {
    renderWithDialog();

    await screen.findByText('Watering');
    fireEvent.click(screen.getByRole('button', { name: '删除 Watering' }));

    const dialog = await screen.findByRole('dialog', { name: '删除模板' });
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));

    expect(deleteQuickTemplateMock).not.toHaveBeenCalled();
  });

  it('deletes only after destructive confirmation', async () => {
    renderWithDialog();

    await screen.findByText('Watering');
    fireEvent.click(screen.getByRole('button', { name: '删除 Watering' }));

    const dialog = await screen.findByRole('dialog', { name: '删除模板' });
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(deleteQuickTemplateMock).toHaveBeenCalledWith('tpl-1');
    });
  });
});
