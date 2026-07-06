import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { createTenant, listTenants, setTenantStatus } from './tenants';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('tenants api', () => {
  it('listTenants calls GET /tenants', async () => {
    await listTenants();
    expect(requestMock).toHaveBeenCalledWith('/tenants');
  });

  it('listTenants appends page query when pagination is requested', async () => {
    await listTenants({ page: 2, pageSize: 50 });
    expect(requestMock).toHaveBeenCalledWith('/tenants?page=2&pageSize=50');
  });

  it('createTenant calls POST /tenants with the shared DTO payload', async () => {
    const dto = {
      name: 'Tenant One',
      code: 'tenant-one',
      adminUsername: 'tenant_admin',
      adminDisplayName: 'Tenant Admin',
    };

    await createTenant(dto);

    expect(requestMock).toHaveBeenCalledWith('/tenants', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  });

  it('setTenantStatus calls POST /tenants/:id/status', async () => {
    await setTenantStatus('t1', 'suspended');
    expect(requestMock).toHaveBeenCalledWith('/tenants/t1/status', {
      method: 'POST', body: JSON.stringify({ status: 'suspended' }),
    });
  });
});
