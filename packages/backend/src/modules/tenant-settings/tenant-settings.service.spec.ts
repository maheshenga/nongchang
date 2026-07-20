import { describe, expect, it, vi } from 'vitest';
import { Role, type AuthUser } from '@nongchang/shared';
import { TenantSettingsService } from './tenant-settings.service';

const systemAdmin: AuthUser = {
  userId: 'sys',
  tenantId: 't1',
  role: Role.SYSTEM_ADMIN,
  agentId: null,
  ownerId: null,
};

const merchant: AuthUser = {
  userId: 'merchant',
  tenantId: 't1',
  role: Role.MERCHANT,
  agentId: null,
  ownerId: 'merchant',
};

function make() {
  const prisma = {
    tenantSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
  };
  const cache = {
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
  };
  return {
    prisma,
    cache,
    service: new TenantSettingsService(prisma as any, cache as any),
  };
}

describe('TenantSettingsService', () => {
  it('uses tenant name as brandName when no settings row exists', async () => {
    const h = make();
    h.prisma.tenantSettings.findUnique.mockResolvedValue(null);
    h.prisma.tenant.findUnique.mockResolvedValue({ name: '云岭农业' });

    await expect(h.service.getByTenantId('t1')).resolves.toMatchObject({
      brandName: '云岭农业',
      publicCoordinateMode: 'hidden',
      defaultCropName: '作物',
    });
  });

  it('upserts only the current tenant and invalidates its public trace cache', async () => {
    const h = make();
    h.prisma.tenantSettings.upsert.mockResolvedValue({
      publicCoordinateMode: 'hidden',
      brandName: '农场溯源管理',
      industryName: '农业',
      defaultCropName: '葡萄',
      workbenchTitle: '农业工作台',
      defaultBaseLabel: '当前基地',
      supportContact: null,
    });

    await h.service.update(systemAdmin, { defaultCropName: '葡萄' });

    expect(h.prisma.tenantSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 't1' },
    }));
    expect(h.cache.invalidateTenant).toHaveBeenCalledWith('t1');
  });

  it('allows a system admin to clear the support contact', async () => {
    const h = make();
    h.prisma.tenantSettings.upsert.mockResolvedValue({
      publicCoordinateMode: 'hidden',
      brandName: '农场溯源管理',
      industryName: '农业',
      defaultCropName: '作物',
      workbenchTitle: '农业工作台',
      defaultBaseLabel: '当前基地',
      supportContact: null,
    });

    await h.service.update(systemAdmin, { supportContact: null });

    expect(h.prisma.tenantSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 't1' },
      create: { tenantId: 't1', supportContact: null },
      update: { supportContact: null },
    }));
  });

  it('rejects writes from non-system administrators', async () => {
    const h = make();

    await expect(h.service.update(merchant, { defaultCropName: '葡萄' })).rejects.toThrow('无权修改租户设置');
    expect(h.prisma.tenantSettings.upsert).not.toHaveBeenCalled();
  });
});
