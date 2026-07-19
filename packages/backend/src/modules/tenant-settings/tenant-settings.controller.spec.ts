import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { Role, type AuthUser } from '@nongchang/shared';
import { TenantSettingsController } from './tenant-settings.controller';

const systemAdmin: AuthUser = {
  userId: 'sys',
  tenantId: 't1',
  role: Role.SYSTEM_ADMIN,
  agentId: null,
  ownerId: null,
};

describe('TenantSettingsController', () => {
  it('scopes reads to the authenticated tenant', async () => {
    const service = { getByTenantId: vi.fn().mockResolvedValue({}) };
    const controller = new TenantSettingsController(service as any);

    await controller.get(systemAdmin);

    expect(service.getByTenantId).toHaveBeenCalledWith('t1');
  });

  it('requires system_admin for updates', () => {
    expect(Reflect.getMetadata(ROLES_KEY, TenantSettingsController.prototype.update))
      .toEqual([Role.SYSTEM_ADMIN]);
  });

  it('passes only the authenticated user and validated settings input to the service', async () => {
    const service = { update: vi.fn().mockResolvedValue({}) };
    const controller = new TenantSettingsController(service as any);
    const dto = { defaultCropName: '葡萄' as const };

    await controller.update(systemAdmin, dto);

    expect(service.update).toHaveBeenCalledWith(systemAdmin, dto);
  });
});
