import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CreateTenantResponse, TenantListItem } from '@nongchang/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listTenantsMock = vi.fn();
const createTenantMock = vi.fn();
const setTenantStatusMock = vi.fn();

vi.mock('../api/tenants', () => ({
  listTenants: () => listTenantsMock(),
  createTenant: (...args: unknown[]) => createTenantMock(...args),
  setTenantStatus: (...args: unknown[]) => setTenantStatusMock(...args),
}));

import TenantManagement from './TenantManagement';

const tenants: TenantListItem[] = [
  {
    id: 'tenant-1',
    name: 'Demo Tenant',
    code: 'DEMO',
    status: 'active',
    createdAt: '2026-07-05T00:00:00.000Z',
    userCount: 4,
    agentCount: 2,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listTenantsMock.mockResolvedValue(tenants);
  createTenantMock.mockResolvedValue({
    ...tenants[0],
    id: 'tenant-2',
    name: 'New Tenant',
    code: 'NEW',
    adminUser: {
      id: 'admin-1',
      username: 'admin',
      role: 'system_admin',
      displayName: 'Tenant Admin',
    },
    initialPassword: 'generated-secret',
  } satisfies CreateTenantResponse);
  setTenantStatusMock.mockResolvedValue({ id: 'tenant-1', status: 'suspended' });
});

describe('TenantManagement', () => {
  it('renders real tenant list fields', async () => {
    render(<TenantManagement />);
    await screen.findByText('Demo Tenant');

    expect(screen.getByRole('heading', { name: '租户管理' })).toBeTruthy();
    expect(screen.getByText('DEMO')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('creates a tenant and shows the generated initial password', async () => {
    render(<TenantManagement />);
    await screen.findByText('Demo Tenant');

    fireEvent.click(screen.getByRole('button', { name: '新建租户' }));
    fireEvent.change(screen.getByLabelText('租户名称'), { target: { value: 'New Tenant' } });
    fireEvent.change(screen.getByLabelText('机构编码'), { target: { value: 'NEW' } });
    fireEvent.change(screen.getByLabelText('管理员账号'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('管理员姓名'), { target: { value: 'Tenant Admin' } });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(createTenantMock).toHaveBeenCalledWith({
        name: 'New Tenant',
        code: 'NEW',
        adminUsername: 'admin',
        adminDisplayName: 'Tenant Admin',
      });
    });
    expect(await screen.findByText(/generated-secret/)).toBeTruthy();
    expect(listTenantsMock).toHaveBeenCalledTimes(2);
  });

  it('suspends an active tenant through the real status API', async () => {
    render(<TenantManagement />);
    await screen.findByText('Demo Tenant');

    fireEvent.click(screen.getByRole('button', { name: '停用 DEMO' }));
    await waitFor(() => {
      expect(setTenantStatusMock).toHaveBeenCalledWith('tenant-1', 'suspended');
    });
    expect(listTenantsMock).toHaveBeenCalledTimes(2);
  });
});
