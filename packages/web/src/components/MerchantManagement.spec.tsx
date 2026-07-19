import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Role, type MerchantListItem, type UserGroupView } from '@nongchang/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMerchantsMock = vi.fn();
const createUserMock = vi.fn();
const updateUserMock = vi.fn();
const setUserStatusMock = vi.fn();
const listUserGroupsMock = vi.fn();
const assignUserGroupMock = vi.fn();

vi.mock('../api/users', () => ({
  listMerchants: (...args: unknown[]) => listMerchantsMock(...args),
  createUser: (...args: unknown[]) => createUserMock(...args),
  updateUser: (...args: unknown[]) => updateUserMock(...args),
  setUserStatus: (...args: unknown[]) => setUserStatusMock(...args),
}));

vi.mock('../api/user-group', () => ({
  listUserGroups: () => listUserGroupsMock(),
  assignUserGroup: (...args: unknown[]) => assignUserGroupMock(...args),
}));

import MerchantManagement from './MerchantManagement';
import { DialogHost } from '../hooks/useDialog';

const renderWithDialog = () => render(<><MerchantManagement /><DialogHost /></>);
const waitForGroups = () => screen.findByRole('option', { name: 'Default Farm Group（默认）' });

const merchants: MerchantListItem[] = [
  {
    id: 'merchant-1',
    username: 'north-owner',
    displayName: 'North Farm',
    phone: '13800000001',
    status: 'active',
    agentId: 'agent-1',
    groupId: 'group-default',
    groupName: 'Default Farm Group',
    createdAt: '2026-07-01T00:00:00.000Z',
    fieldCount: 2,
    totalArea: 18.5,
  },
  {
    id: 'merchant-2',
    username: 'south-owner',
    displayName: 'South Farm',
    phone: null,
    status: 'suspended',
    agentId: null,
    groupId: null,
    groupName: null,
    createdAt: '2026-07-02T00:00:00.000Z',
    fieldCount: 0,
    totalArea: 0,
  },
];

const groups: UserGroupView[] = [
  {
    id: 'group-default',
    name: 'Default Farm Group',
    isDefault: true,
    permissions: [],
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'group-alt',
    name: 'Alternate Farm Group',
    isDefault: false,
    permissions: [],
    createdAt: '2026-07-02T00:00:00.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listMerchantsMock.mockResolvedValue(merchants);
  listUserGroupsMock.mockResolvedValue(groups);
  assignUserGroupMock.mockResolvedValue({ ok: true });
  createUserMock.mockResolvedValue({
    id: 'merchant-3',
    username: 'east-owner',
    role: Role.MERCHANT,
    agentId: null,
    displayName: 'East Farm',
    initialPassword: 'generated-secret',
  });
  updateUserMock.mockResolvedValue(merchants[0]);
  setUserStatusMock.mockResolvedValue({ id: 'merchant-1', status: 'suspended' });
});

describe('MerchantManagement Fluent table', () => {
  it('renders merchants and filters by search text and status', async () => {
    renderWithDialog();
    await screen.findByText('North Farm');

    expect(screen.getByRole('heading', { name: '商户管理与档案' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新增入驻' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '企业名称' })).toBeTruthy();
    expect(screen.getByText('South Farm')).toBeTruthy();
    expect(screen.getByText('未填')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('搜索商户名称或联系人'), { target: { value: 'north' } });
    expect(screen.getByText('North Farm')).toBeTruthy();
    expect(screen.queryByText('South Farm')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('搜索商户名称或联系人'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '已停用' }));
    expect(screen.queryByText('North Farm')).toBeNull();
    expect(screen.getByText('South Farm')).toBeTruthy();
  });

  it('creates a merchant user and shows the backend generated initial password', async () => {
    renderWithDialog();
    await screen.findByText('North Farm');

    fireEvent.click(screen.getByRole('button', { name: '新增入驻' }));
    await waitForGroups();
    fireEvent.change(screen.getByLabelText('企业 / 商户名称'), { target: { value: 'East Farm' } });
    fireEvent.change(screen.getByLabelText('联系人 / 用户名'), { target: { value: 'east-owner' } });
    fireEvent.change(screen.getByLabelText('手机号码'), { target: { value: '13800000003' } });
    fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledWith({
        username: 'east-owner',
        role: Role.MERCHANT,
        displayName: 'East Farm',
        phone: '13800000003',
        groupId: 'group-default',
      });
    });
    const dialog = await screen.findByRole('dialog', { name: '商户已创建' });
    expect(within(dialog).getByText(/generated-secret/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '知道了' }));

    await waitFor(() => expect(listMerchantsMock).toHaveBeenCalledTimes(2));
  });

  it('creates a merchant with the selected tenant group', async () => {
    renderWithDialog();
    await screen.findByText('North Farm');

    fireEvent.click(screen.getByRole('button', { name: '新增入驻' }));
    await waitForGroups();
    fireEvent.change(screen.getByLabelText('企业 / 商户名称'), { target: { value: 'East Farm' } });
    fireEvent.change(screen.getByLabelText('联系人 / 用户名'), { target: { value: 'east-owner' } });
    fireEvent.change(screen.getByLabelText('用户组'), { target: { value: 'group-alt' } });
    fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

    await waitFor(() => expect(createUserMock).toHaveBeenCalledWith(expect.objectContaining({
      role: Role.MERCHANT,
      groupId: 'group-alt',
    })));
  });

  it('updates a merchant with username disabled and phone nullable', async () => {
    renderWithDialog();
    await screen.findByText('North Farm');

    fireEvent.click(screen.getByRole('button', { name: '编辑商户 North Farm' }));
    expect((screen.getByLabelText('联系人 / 用户名') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('企业 / 商户名称'), { target: { value: 'North Updated' } });
    fireEvent.change(screen.getByLabelText('手机号码'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith('merchant-1', { displayName: 'North Updated', phone: null });
    });
  });

  it('does not reassign an edited merchant when its group is unchanged', async () => {
    renderWithDialog();
    await screen.findByText('North Farm');

    fireEvent.click(screen.getByRole('button', { name: '编辑商户 North Farm' }));
    await waitForGroups();
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith('merchant-1', {
      displayName: 'North Farm',
      phone: '13800000001',
    }));
    expect(assignUserGroupMock).not.toHaveBeenCalled();
  });

  it('reassigns an edited merchant only when its group changes', async () => {
    renderWithDialog();
    await screen.findByText('North Farm');

    fireEvent.click(screen.getByRole('button', { name: '编辑商户 North Farm' }));
    await waitForGroups();
    fireEvent.change(screen.getByLabelText('用户组'), { target: { value: 'group-alt' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(assignUserGroupMock).toHaveBeenCalledWith({
      userId: 'merchant-1',
      groupId: 'group-alt',
    }));
  });

  it('unassigns an edited merchant when its group is cleared', async () => {
    renderWithDialog();
    await screen.findByText('North Farm');

    fireEvent.click(screen.getByRole('button', { name: '编辑商户 North Farm' }));
    await waitForGroups();
    fireEvent.change(screen.getByLabelText('用户组'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(assignUserGroupMock).toHaveBeenCalledWith({
      userId: 'merchant-1',
      groupId: null,
    }));
  });

  it('does not reassign an already-unassigned merchant when its group stays empty', async () => {
    renderWithDialog();
    await screen.findByText('South Farm');

    fireEvent.click(screen.getByRole('button', { name: '编辑商户 South Farm' }));
    await waitForGroups();
    fireEvent.change(screen.getByLabelText('用户组'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith('merchant-2', {
      displayName: 'South Farm',
      phone: null,
    }));
    expect(assignUserGroupMock).not.toHaveBeenCalled();
  });

  it('keeps the edit dialog open and avoids reload when reassignment fails', async () => {
    assignUserGroupMock.mockRejectedValue(new Error('group assignment failed'));
    renderWithDialog();
    await screen.findByText('North Farm');

    fireEvent.click(screen.getByRole('button', { name: '编辑商户 North Farm' }));
    await waitForGroups();
    fireEvent.change(screen.getByLabelText('用户组'), { target: { value: 'group-alt' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    const errorDialog = await screen.findByRole('dialog', { name: '操作失败' });
    expect(within(errorDialog).getByText('group assignment failed')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: '编辑商户档案' })).toBeTruthy();
    expect(listMerchantsMock).toHaveBeenCalledTimes(1);
  });

  it('toggles merchant status through the real status API', async () => {
    renderWithDialog();
    await screen.findByText('North Farm');

    fireEvent.click(screen.getByRole('button', { name: '停用商户 North Farm' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '停用商户' })).getByRole('button', { name: '停用' }));
    await waitFor(() => {
      expect(setUserStatusMock).toHaveBeenCalledWith('merchant-1', 'suspended');
    });

    fireEvent.click(screen.getByRole('button', { name: '启用商户 South Farm' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '启用商户' })).getByRole('button', { name: '启用' }));
    await waitFor(() => {
      expect(setUserStatusMock).toHaveBeenCalledWith('merchant-2', 'active');
    });
  });

  it('loads paginated merchant pages so later records remain reachable', async () => {
    listMerchantsMock.mockImplementation((query: { page: number; pageSize: number }) => Promise.resolve({
      items: merchants,
      total: 201,
      page: query.page,
      pageSize: query.pageSize,
    }));

    renderWithDialog();
    await screen.findByText('Page 1 / 3');

    expect(listMerchantsMock).toHaveBeenCalledWith({ page: 1, pageSize: 100 });

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() => {
      expect(listMerchantsMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 100 });
    });
    expect(await screen.findByText('Page 2 / 3')).toBeTruthy();
  });
});
