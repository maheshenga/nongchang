import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AgentListItem } from '@nongchang/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listAgentsMock = vi.fn();
const createAgentMock = vi.fn();
const updateAgentMock = vi.fn();
const setAgentStatusMock = vi.fn();

vi.mock('../api/agents', () => ({
  listAgents: (...args: unknown[]) => listAgentsMock(...args),
  createAgent: (...args: unknown[]) => createAgentMock(...args),
  updateAgent: (...args: unknown[]) => updateAgentMock(...args),
  setAgentStatus: (...args: unknown[]) => setAgentStatusMock(...args),
}));

import AgentManagement from './AgentManagement';
import { DialogHost } from '../hooks/useDialog';

const renderWithDialog = () => render(<><AgentManagement /><DialogHost /></>);

const agents: AgentListItem[] = [
  {
    id: 'agent-1',
    name: 'North Agent',
    region: 'North Region',
    status: 'active',
    createdAt: '2026-07-01T00:00:00.000Z',
    merchantCount: 3,
  },
  {
    id: 'agent-2',
    name: 'South Agent',
    region: 'South Region',
    status: 'suspended',
    createdAt: '2026-07-02T00:00:00.000Z',
    merchantCount: 1,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listAgentsMock.mockResolvedValue(agents);
  createAgentMock.mockResolvedValue(agents[0]);
  updateAgentMock.mockResolvedValue(agents[0]);
  setAgentStatusMock.mockResolvedValue({ id: 'agent-1', status: 'suspended' });
});

describe('AgentManagement Fluent table', () => {
  it('renders the real agent list and filters by name or region', async () => {
    listAgentsMock.mockImplementation((query: { page: number; pageSize: number; search?: string }) => Promise.resolve({
      items: query.search ? [agents[0]] : agents,
      total: query.search ? 1 : agents.length,
      page: query.page,
      pageSize: query.pageSize,
    }));
    renderWithDialog();
    await screen.findByText('North Agent');

    expect(screen.getByRole('heading', { name: '代理商管理' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新增代理商' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '代理商名称' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '下级商户' })).toBeTruthy();
    expect(screen.getByText('South Agent')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('搜索代理商名称或辖区'), { target: { value: 'north' } });

    await waitFor(() => expect(listAgentsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 50, search: 'north' }));
    expect(await screen.findByText('North Agent')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('South Agent')).toBeNull());
  });

  it('creates an agent with the real create API payload', async () => {
    renderWithDialog();
    await screen.findByText('North Agent');

    fireEvent.click(screen.getByRole('button', { name: '新增代理商' }));
    fireEvent.change(screen.getByLabelText('代理商名称'), { target: { value: 'East Agent' } });
    fireEvent.change(screen.getByLabelText('辖区'), { target: { value: 'East Region' } });
    fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

    await waitFor(() => {
      expect(createAgentMock).toHaveBeenCalledWith({ name: 'East Agent', region: 'East Region' });
    });
    expect(listAgentsMock).toHaveBeenCalledTimes(2);
  });

  it('updates an agent with the real update API payload', async () => {
    renderWithDialog();
    await screen.findByText('North Agent');

    fireEvent.click(screen.getByRole('button', { name: '编辑代理商 North Agent' }));
    fireEvent.change(screen.getByLabelText('代理商名称'), { target: { value: 'North Updated' } });
    fireEvent.change(screen.getByLabelText('辖区'), { target: { value: 'Updated Region' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => {
      expect(updateAgentMock).toHaveBeenCalledWith('agent-1', { name: 'North Updated', region: 'Updated Region' });
    });
  });

  it('toggles active and suspended status through the real status API', async () => {
    renderWithDialog();
    await screen.findByText('North Agent');

    fireEvent.click(screen.getByRole('button', { name: '停用代理商 North Agent' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '停用代理商' })).getByRole('button', { name: '停用' }));
    await waitFor(() => {
      expect(setAgentStatusMock).toHaveBeenCalledWith('agent-1', 'suspended');
    });

    fireEvent.click(screen.getByRole('button', { name: '启用代理商 South Agent' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '启用代理商' })).getByRole('button', { name: '启用' }));
    await waitFor(() => {
      expect(setAgentStatusMock).toHaveBeenCalledWith('agent-2', 'active');
    });
  });

  it('loads paginated pages so records beyond the first page remain reachable', async () => {
    listAgentsMock.mockImplementation((query: { page: number; pageSize: number }) => Promise.resolve({
      items: agents,
      total: 201,
      page: query.page,
      pageSize: query.pageSize,
    }));

    renderWithDialog();
    await screen.findByText('第 1 / 5 页');

    expect(listAgentsMock).toHaveBeenCalledWith({ page: 1, pageSize: 50 });

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => {
      expect(listAgentsMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 50 });
    });
    expect(await screen.findByText('第 2 / 5 页')).toBeTruthy();
  });
});
