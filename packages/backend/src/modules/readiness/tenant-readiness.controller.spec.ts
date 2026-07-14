import { describe, expect, it, vi } from 'vitest';
import { Role, type AuthUser } from '@nongchang/shared';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { TenantReadinessController } from './tenant-readiness.controller';

const actor: AuthUser = {
  userId: 'admin-1',
  tenantId: 'tenant-1',
  role: Role.SYSTEM_ADMIN,
  agentId: null,
  ownerId: null,
};

describe('TenantReadinessController', () => {
  it('restricts tenant readiness to system administrators', () => {
    expect(Reflect.getMetadata(ROLES_KEY, TenantReadinessController)).toEqual([
      Role.SYSTEM_ADMIN,
    ]);
  });

  it('passes the authenticated tenant actor to the readiness service', async () => {
    const view = { ready: false, checks: [] };
    const readiness = { get: vi.fn().mockResolvedValue(view) };
    const controller = new TenantReadinessController(readiness as never);

    await expect(controller.get(actor)).resolves.toBe(view);
    expect(readiness.get).toHaveBeenCalledWith(actor);
  });
});
