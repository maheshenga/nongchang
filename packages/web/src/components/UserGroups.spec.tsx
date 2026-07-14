import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserGroupView } from '@nongchang/shared';

const listUserGroupsMock = vi.fn();
const createUserGroupMock = vi.fn();
const updateUserGroupMock = vi.fn();
const deleteUserGroupMock = vi.fn();
const authMock = vi.hoisted(() => ({
  role: 'system_admin' as 'system_admin' | 'agent_admin',
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    user: {
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: authMock.role,
      agentId: authMock.role === 'agent_admin' ? 'agent-1' : null,
      ownerId: null,
    },
  }),
}));

vi.mock('../api/user-group', () => ({
  listUserGroups: () => listUserGroupsMock(),
  createUserGroup: (...args: unknown[]) => createUserGroupMock(...args),
  updateUserGroup: (...args: unknown[]) => updateUserGroupMock(...args),
  deleteUserGroup: (...args: unknown[]) => deleteUserGroupMock(...args),
}));

import UserGroups from './UserGroups';
import { DialogHost } from '../hooks/useDialog';

const renderWithDialog = () => render(<><UserGroups /><DialogHost /></>);

const groups: UserGroupView[] = [
  {
    id: 'group-1',
    name: '记录员',
    isDefault: true,
    permissions: ['record:create'],
    createdAt: '2026-07-04T00:00:00.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  authMock.role = 'system_admin';
  listUserGroupsMock.mockResolvedValue(groups);
  createUserGroupMock.mockResolvedValue(groups[0]);
  updateUserGroupMock.mockResolvedValue(groups[0]);
  deleteUserGroupMock.mockResolvedValue({ ok: true });
});

describe('UserGroups permission enforcement wording', () => {
  it('states that only connected interfaces enforce selected group permissions', async () => {
    renderWithDialog();
    await screen.findByText('记录员');

    expect(screen.getByRole('heading', { name: '用户分组' })).toBeTruthy();
    expect(screen.getByText(/经营角色在已接入接口会按用户组权限放行/)).toBeTruthy();
    expect(screen.getByText(/创建农事记录、查看农事记录、查看地块、查看批次、查看溯源/)).toBeTruthy();
    expect(screen.getByText(/管理员与未接入接口仍按角色与业务范围鉴权/)).toBeTruthy();
    expect(screen.queryByText(/当前系统仍以角色作为接口鉴权依据/)).toBeNull();
    expect(screen.queryByText(/暂不参与接口放行/)).toBeNull();
  });

  it('renders agent administrators as read-only without mutation controls', async () => {
    authMock.role = 'agent_admin';
    renderWithDialog();

    await screen.findByText('记录员');

    expect(screen.getByText('代理管理员可查看用户组配置；新建、编辑和删除由系统管理员负责。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /新建用户组/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '编辑 记录员' })).toBeNull();
    expect(screen.queryByRole('button', { name: '删除 记录员' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: '操作' })).toBeNull();
    expect(createUserGroupMock).not.toHaveBeenCalled();
    expect(updateUserGroupMock).not.toHaveBeenCalled();
    expect(deleteUserGroupMock).not.toHaveBeenCalled();
  });

  it('saves selected permissions used by connected interfaces', async () => {
    renderWithDialog();
    await screen.findByText('记录员');

    fireEvent.click(screen.getByRole('button', { name: /新建用户组/ }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '采收员' } });
    fireEvent.click(screen.getByLabelText('创建农事记录'));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(createUserGroupMock).toHaveBeenCalledWith({
        name: '采收员',
        isDefault: false,
        permissions: ['record:create'],
      });
    });
  });

  it('edits default flag and known permissions through the real update API', async () => {
    renderWithDialog();
    await screen.findByText('记录员');

    fireEvent.click(screen.getByRole('button', { name: '编辑 记录员' }));
    const recordCreate = screen.getByLabelText('创建农事记录') as HTMLInputElement;
    expect(recordCreate.checked).toBe(true);
    fireEvent.click(recordCreate);
    fireEvent.click(screen.getByLabelText(/设为默认组/));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(updateUserGroupMock).toHaveBeenCalledWith('group-1', {
        name: '记录员',
        isDefault: false,
        permissions: [],
      });
    });
  });

  it('keeps destructive deletion behind confirmation', async () => {
    renderWithDialog();
    await screen.findByText('记录员');

    fireEvent.click(screen.getByRole('button', { name: '删除 记录员' }));

    const dialog = await screen.findByRole('dialog', { name: '删除用户组' });
    expect(within(dialog).getByText('确认删除用户组「记录员」？如果仍有关联用户，后端可能拒绝删除。')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(deleteUserGroupMock).toHaveBeenCalledWith('group-1');
    });
  });
});
