import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Role, type AuthUser } from '@nongchang/shared';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { TenantController } from './tenant.controller';

const platformAdmin: AuthUser = {
  userId: 'platform-user',
  tenantId: 'platform-tenant',
  role: Role.PLATFORM_ADMIN,
  agentId: null,
  ownerId: null,
};

describe('TenantController', () => {
  it('requires platform_admin at controller level', () => {
    const reflector = new Reflector();
    const roles = reflector.get<Role[]>(ROLES_KEY, TenantController);
    expect(roles).toEqual([Role.PLATFORM_ADMIN]);
  });

  it('delegates tenant lifecycle actions to the service', async () => {
    const svc = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 't1' }),
      setStatus: vi.fn().mockResolvedValue({ id: 't1', status: 'suspended' }),
    };
    const controller = new TenantController(svc as any);
    await expect(controller.list()).resolves.toEqual([]);
    await expect(controller.create({
      name: 'Tenant A',
      code: 'TENANT_A',
      adminUsername: 'admin',
      adminDisplayName: 'Admin',
    })).resolves.toEqual({ id: 't1' });
    await expect(controller.setStatus(platformAdmin, 't1', { status: 'suspended' }))
      .resolves.toEqual({ id: 't1', status: 'suspended' });
    expect(svc.setStatus).toHaveBeenCalledWith(platformAdmin, 't1', 'suspended');
  });
});
