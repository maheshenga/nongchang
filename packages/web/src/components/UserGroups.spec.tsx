import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserGroupView } from '@nongchang/shared';

const listUserGroupsMock = vi.fn();
const createUserGroupMock = vi.fn();
const updateUserGroupMock = vi.fn();
const deleteUserGroupMock = vi.fn();

vi.mock('../api/user-group', () => ({
  listUserGroups: () => listUserGroupsMock(),
  createUserGroup: (...args: unknown[]) => createUserGroupMock(...args),
  updateUserGroup: (...args: unknown[]) => updateUserGroupMock(...args),
  deleteUserGroup: (...args: unknown[]) => deleteUserGroupMock(...args),
}));

import UserGroups from './UserGroups';

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
  listUserGroupsMock.mockResolvedValue(groups);
  createUserGroupMock.mockResolvedValue(groups[0]);
  updateUserGroupMock.mockResolvedValue(groups[0]);
  deleteUserGroupMock.mockResolvedValue({ ok: true });
});

describe('UserGroups permission enforcement wording', () => {
  it('states that only connected interfaces enforce selected group permissions', async () => {
    render(<UserGroups />);
    await screen.findByText('记录员');

    expect(screen.getByRole('heading', { name: '用户分组' })).toBeTruthy();
    expect(screen.getByText(/经营角色在已接入接口会按用户组权限放行/)).toBeTruthy();
    expect(screen.getByText(/当前已接入:创建农事记录、查看农事记录/)).toBeTruthy();
    expect(screen.getByText(/管理员与未接入接口仍按角色与业务范围鉴权/)).toBeTruthy();
    expect(screen.queryByText(/当前系统仍以角色作为接口鉴权依据/)).toBeNull();
    expect(screen.queryByText(/暂不参与接口放行/)).toBeNull();
  });

  it('saves selected permissions used by connected interfaces', async () => {
    render(<UserGroups />);
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
});
