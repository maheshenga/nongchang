import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import { TenantService } from './tenant.service';

const platformAdmin: AuthUser = {
  userId: 'platform-user',
  tenantId: 'platform-tenant',
  role: Role.PLATFORM_ADMIN,
  agentId: null,
  ownerId: null,
};

function makePrisma() {
  const tx = {
    tenant: { create: vi.fn() },
    user: { create: vi.fn() },
    userGroup: { create: vi.fn() },
  };
  return {
    tenant: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((arg: any) => Array.isArray(arg) ? Promise.all(arg) : arg(tx)),
    __tx: tx,
  } as any;
}

describe('TenantService', () => {
  it('lists tenants with user and agent counts for platform admins', async () => {
    const prisma = makePrisma();
    prisma.tenant.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Tenant A',
        code: 'TENANT_A',
        status: 'active',
        createdAt: new Date('2026-07-05T00:00:00.000Z'),
        _count: { users: 2, agents: 1 },
      },
    ]);
    const rows = await new TenantService(prisma).list();
    expect(rows).toEqual([
      {
        id: 't1',
        name: 'Tenant A',
        code: 'TENANT_A',
        status: 'active',
        createdAt: '2026-07-05T00:00:00.000Z',
        userCount: 2,
        agentCount: 1,
      },
    ]);
  });

  it('returns a paginated envelope when tenants are requested with page/pageSize', async () => {
    const prisma = makePrisma();
    prisma.tenant.findMany.mockResolvedValue([
      {
        id: 't2',
        name: 'Tenant B',
        code: 'TENANT_B',
        status: 'active',
        createdAt: new Date('2026-07-06T00:00:00.000Z'),
        _count: { users: 3, agents: 2 },
      },
    ]);
    prisma.tenant.count.mockResolvedValue(3);

    const result = await new TenantService(prisma).list({ page: 2, pageSize: 1 });

    expect(prisma.tenant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 1,
      take: 1,
    }));
    expect(prisma.tenant.count).toHaveBeenCalledWith({});
    expect(result).toEqual({
      items: [
        {
          id: 't2',
          name: 'Tenant B',
          code: 'TENANT_B',
          status: 'active',
          createdAt: '2026-07-06T00:00:00.000Z',
          userCount: 3,
          agentCount: 2,
        },
      ],
      total: 3,
      page: 2,
      pageSize: 1,
    });
  });

  it('creates a tenant with an initial tenant system_admin and default group', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.__tx.tenant.create.mockResolvedValue({
      id: 'tenant-new',
      name: 'New Tenant',
      code: 'NEW_TENANT',
      status: 'active',
      createdAt: new Date('2026-07-05T01:00:00.000Z'),
    });
    prisma.__tx.user.create.mockResolvedValue({
      id: 'admin-new',
      username: 'admin',
      role: Role.SYSTEM_ADMIN,
      displayName: 'Tenant Admin',
    });
    const result = await new TenantService(prisma).create({
      name: 'New Tenant',
      code: 'new_tenant',
      adminUsername: 'admin',
      adminDisplayName: 'Tenant Admin',
      adminPhone: '13800000000',
    });

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { code: 'NEW_TENANT' } });
    expect(prisma.__tx.tenant.create).toHaveBeenCalledWith({
      data: { name: 'New Tenant', code: 'NEW_TENANT', status: 'active' },
    });
    expect(prisma.__tx.user.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 'tenant-new',
      username: 'admin',
      role: Role.SYSTEM_ADMIN,
      displayName: 'Tenant Admin',
      phone: '13800000000',
      status: 'active',
    });
    expect(prisma.__tx.userGroup.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-new',
        name: '默认用户组',
        isDefault: true,
        permissions: ['record:create', 'record:view', 'field:view', 'batch:view', 'trace:view'],
      },
    });
    expect(result.initialPassword.length).toBeGreaterThan(10);
    expect(result.adminUser).toMatchObject({ id: 'admin-new', username: 'admin', role: Role.SYSTEM_ADMIN });
  });

  it('rejects duplicate tenant codes before creating anything', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(new TenantService(prisma).create({
      name: 'Duplicate',
      code: 'DUP',
      adminUsername: 'admin',
      adminDisplayName: 'Admin',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates tenant status but refuses to suspend the actor tenant', async () => {
    const prisma = makePrisma();
    prisma.tenant.findFirst.mockResolvedValue({ id: 'tenant-a', name: 'Tenant A', code: 'TENANT_A' });
    prisma.tenant.update.mockResolvedValue({ id: 'tenant-a', status: 'suspended' });
    const result = await new TenantService(prisma).setStatus(platformAdmin, 'tenant-a', 'suspended');
    expect(result).toEqual({ id: 'tenant-a', status: 'suspended' });

    await expect(new TenantService(prisma).setStatus(platformAdmin, 'platform-tenant', 'suspended'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFound when changing status for a missing tenant', async () => {
    const prisma = makePrisma();
    prisma.tenant.findFirst.mockResolvedValue(null);
    await expect(new TenantService(prisma).setStatus(platformAdmin, 'missing', 'active'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
