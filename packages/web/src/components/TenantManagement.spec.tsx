import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CreateTenantResponse, TenantListItem } from '@nongchang/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listTenantsMock = vi.fn();
const createTenantMock = vi.fn();
const setTenantStatusMock = vi.fn();

vi.mock('../api/tenants', () => ({
  listTenants: (...args: unknown[]) => listTenantsMock(...args),
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
  {
    id: 'tenant-2',
    name: 'Suspended Tenant',
    code: 'SUSP',
    status: 'suspended',
    createdAt: '2026-07-05T00:00:00.000Z',
    userCount: 1,
    agentCount: 0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listTenantsMock.mockResolvedValue(tenants);
  createTenantMock.mockResolvedValue({
    ...tenants[0],
    id: 'tenant-3',
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
  it('renders real tenant list fields in a Fluent table', async () => {
    render(<TenantManagement />);
    await screen.findByText('Demo Tenant');

    expect(screen.getByRole('heading', { name: '租户管理' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新建租户' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '租户' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '编码' })).toBeTruthy();
    expect(screen.getByText('DEMO')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getAllByText('启用').length).toBeGreaterThan(0);
  });

  it('creates a tenant with trimmed payload and shows the generated initial password', async () => {
    render(<TenantManagement />);
    await screen.findByText('Demo Tenant');

    fireEvent.click(screen.getByRole('button', { name: '新建租户' }));
    fireEvent.change(screen.getByLabelText('租户名称'), { target: { value: ' New Tenant ' } });
    fireEvent.change(screen.getByLabelText('机构编码'), { target: { value: ' NEW ' } });
    fireEvent.change(screen.getByLabelText('管理员账号'), { target: { value: ' admin ' } });
    fireEvent.change(screen.getByLabelText('管理员姓名'), { target: { value: ' Tenant Admin ' } });
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

  it('sends non-empty admin phone and trims it', async () => {
    render(<TenantManagement />);
    await screen.findByText('Demo Tenant');

    fireEvent.click(screen.getByRole('button', { name: '新建租户' }));
    fireEvent.change(screen.getByLabelText('租户名称'), { target: { value: 'Phone Tenant' } });
    fireEvent.change(screen.getByLabelText('机构编码'), { target: { value: 'PHONE' } });
    fireEvent.change(screen.getByLabelText('管理员账号'), { target: { value: 'phone-admin' } });
    fireEvent.change(screen.getByLabelText('管理员姓名'), { target: { value: 'Phone Admin' } });
    fireEvent.change(screen.getByLabelText('管理员手机号'), { target: { value: ' 13800000000 ' } });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(createTenantMock).toHaveBeenCalledWith(expect.objectContaining({
        adminPhone: '13800000000',
      }));
    });
  });

  it('toggles tenant status through the real status API', async () => {
    render(<TenantManagement />);
    await screen.findByText('Demo Tenant');

    fireEvent.click(screen.getByRole('button', { name: '停用 DEMO' }));
    await waitFor(() => {
      expect(setTenantStatusMock).toHaveBeenCalledWith('tenant-1', 'suspended');
    });

    fireEvent.click(screen.getByRole('button', { name: '启用 SUSP' }));
    await waitFor(() => {
      expect(setTenantStatusMock).toHaveBeenCalledWith('tenant-2', 'active');
    });
  });

  it('loads paginated tenant pages so later tenants remain reachable', async () => {
    listTenantsMock.mockImplementation((query: { page: number; pageSize: number }) => Promise.resolve({
      items: tenants,
      total: 201,
      page: query.page,
      pageSize: query.pageSize,
    }));

    render(<TenantManagement />);
    await screen.findByText('第 1 / 3 页');

    expect(listTenantsMock).toHaveBeenCalledWith({ page: 1, pageSize: 100 });

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => {
      expect(listTenantsMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 100 });
    });
    expect(await screen.findByText('第 2 / 3 页')).toBeTruthy();
  });
});
