import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CropPhenologyItem } from '@nongchang/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listPhenologiesMock = vi.fn();
const createPhenologyMock = vi.fn();
const deletePhenologyMock = vi.fn();

vi.mock('../api/phenology', () => ({
  listPhenologies: () => listPhenologiesMock(),
  createPhenology: (...args: unknown[]) => createPhenologyMock(...args),
  deletePhenology: (...args: unknown[]) => deletePhenologyMock(...args),
}));

import PhenologyAdmin from './PhenologyAdmin';
import { DialogHost } from '../hooks/useDialog';
import { ToastBanner } from '../hooks/useToast';

const stages: CropPhenologyItem[] = [
  {
    id: 'stage-1',
    tenantId: 'tenant-1',
    cropName: 'Peony',
    stage: 'Sprouting',
    expectedDays: 12,
    sortOrder: 1,
    createdAt: '2026-07-08T00:00:00.000Z',
  },
  {
    id: 'stage-2',
    tenantId: 'tenant-1',
    cropName: 'Peony',
    stage: 'Flowering',
    expectedDays: 20,
    sortOrder: 2,
    createdAt: '2026-07-09T00:00:00.000Z',
  },
];

const renderWithHosts = () => render(<><PhenologyAdmin /><DialogHost /><ToastBanner /></>);

beforeEach(() => {
  vi.clearAllMocks();
  listPhenologiesMock.mockResolvedValue(stages);
  createPhenologyMock.mockResolvedValue(stages[0]);
  deletePhenologyMock.mockResolvedValue({ id: 'stage-1' });
});

describe('PhenologyAdmin Fluent management', () => {
  it('renders grouped stages in a compact Fluent table surface', async () => {
    renderWithHosts();

    await screen.findByText('Peony');

    expect(screen.getByRole('heading', { name: '标准物候模型' })).toBeTruthy();
    expect(screen.getByText('标准全周期 32 天 · 2 个阶段')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '排序' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '阶段' })).toBeTruthy();
    expect(screen.getByRole('table').parentElement?.className).toContain('border-[#E1DFDD]');
  });

  it('creates a phenology stage through the real API wrapper payload', async () => {
    renderWithHosts();

    await screen.findByText('Peony');
    fireEvent.click(screen.getByRole('button', { name: '新增阶段' }));
    fireEvent.change(screen.getByLabelText('作物名称'), { target: { value: '  Chrysanthemum  ' } });
    fireEvent.change(screen.getByLabelText('生长阶段'), { target: { value: '  Budding  ' } });
    fireEvent.change(screen.getByLabelText('预设天数'), { target: { value: '16' } });
    fireEvent.change(screen.getByLabelText('排序'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(createPhenologyMock).toHaveBeenCalledWith({
        cropName: 'Chrysanthemum',
        stage: 'Budding',
        expectedDays: 16,
        sortOrder: 4,
      });
    });
    expect(listPhenologiesMock).toHaveBeenCalledTimes(2);
  });

  it('does not delete when destructive confirmation is cancelled', async () => {
    renderWithHosts();

    await screen.findByText('Sprouting');
    fireEvent.click(screen.getByRole('button', { name: '删除 Peony Sprouting' }));

    const dialog = await screen.findByRole('dialog', { name: '删除物候阶段' });
    expect(within(dialog).getByText('确认删除「Peony / Sprouting」?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));

    expect(deletePhenologyMock).not.toHaveBeenCalled();
  });

  it('deletes only after destructive confirmation', async () => {
    renderWithHosts();

    await screen.findByText('Sprouting');
    fireEvent.click(screen.getByRole('button', { name: '删除 Peony Sprouting' }));

    const dialog = await screen.findByRole('dialog', { name: '删除物候阶段' });
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(deletePhenologyMock).toHaveBeenCalledWith('stage-1');
    });
  });
});
