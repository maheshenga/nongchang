import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Role, type MerchantListItem } from '@nongchang/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMerchantsMock = vi.fn();
const createUserMock = vi.fn();
const updateUserMock = vi.fn();
const setUserStatusMock = vi.fn();

vi.mock('../api/users', () => ({
  listMerchants: (...args: unknown[]) => listMerchantsMock(...args),
  createUser: (...args: unknown[]) => createUserMock(...args),
  updateUser: (...args: unknown[]) => updateUserMock(...args),
  setUserStatus: (...args: unknown[]) => setUserStatusMock(...args),
}));

import MerchantManagement from './MerchantManagement';
import { DialogHost } from '../hooks/useDialog';

const renderWithDialog = () => render(<><MerchantManagement /><DialogHost /></>);

const merchants: MerchantListItem[] = [
  {
    id: 'merchant-1',
    username: 'north-owner',
    displayName: 'North Farm',
    phone: '13800000001',
    status: 'active',
    agentId: 'agent-1',
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
    createdAt: '2026-07-02T00:00:00.000Z',
    fieldCount: 0,
    totalArea: 0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listMerchantsMock.mockResolvedValue(merchants);
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
      });
    });
    const dialog = await screen.findByRole('dialog', { name: '商户已创建' });
    expect(within(dialog).getByText(/generated-secret/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '知道了' }));

    await waitFor(() => expect(listMerchantsMock).toHaveBeenCalledTimes(2));
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
