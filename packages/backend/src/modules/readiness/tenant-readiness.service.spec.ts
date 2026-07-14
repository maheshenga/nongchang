import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AuthUser } from '@nongchang/shared';
import { TenantReadinessService } from './tenant-readiness.service';

const actor: AuthUser = {
  userId: 'admin-1',
  tenantId: 'tenant-1',
  role: Role.SYSTEM_ADMIN,
  agentId: null,
  ownerId: null,
};

function createPrisma() {
  return {
    legalSettings: {
      findUnique: vi.fn().mockResolvedValue({ currentPublicationId: 'publication-1' }),
    },
    integrationConfig: {
      findMany: vi.fn().mockResolvedValue([
        { provider: 'wechat', enabled: true },
        { provider: 'tianditu', enabled: true },
        { provider: 'alipay', enabled: true },
      ]),
    },
    ossConfig: { findUnique: vi.fn().mockResolvedValue({ enabled: true }) },
    aiProvider: { findFirst: vi.fn().mockResolvedValue({ id: 'provider-1' }) },
    creditAccount: { findFirst: vi.fn().mockResolvedValue({ id: 'credit-1' }) },
  };
}

describe('TenantReadinessService', () => {
  beforeEach(() => {
    vi.stubEnv('PUBLIC_BASE_URL', 'https://api.example.com');
    vi.stubEnv('PUBLIC_SUPPORT_CONTACT', 'support@example.com');
    vi.stubEnv('PUBLIC_SALES_CONTACT', 'sales@example.com');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('returns an all-ready, tenant-scoped, secret-safe launch view', async () => {
    const prisma = createPrisma();
    const service = new TenantReadinessService(prisma as never);

    const result = await service.get(actor);

    expect(result.ready).toBe(true);
    expect(result.checks).toHaveLength(10);
    expect(prisma.legalSettings.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: actor.tenantId },
    }));
    expect(prisma.integrationConfig.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: actor.tenantId }),
    }));
    expect(JSON.stringify(result)).not.toContain('support@example.com');
    expect(JSON.stringify(result)).not.toContain('sales@example.com');
    expect(JSON.stringify(result)).not.toContain('api.example.com');
  });

  it('reports missing tenant configuration and deployment configuration without guessing', async () => {
    const prisma = createPrisma();
    prisma.integrationConfig.findMany.mockResolvedValue([
      { provider: 'wechat', enabled: true },
    ]);
    prisma.creditAccount.findFirst.mockResolvedValue(null);
    vi.stubEnv('PUBLIC_BASE_URL', 'http://REPLACE_ME.example.com');
    vi.stubEnv('PUBLIC_SUPPORT_CONTACT', '');
    vi.stubEnv('PUBLIC_SALES_CONTACT', 'undefined');
    const service = new TenantReadinessService(prisma as never);

    const result = await service.get(actor);

    expect(result.ready).toBe(false);
    expect(result.checks.filter((check) => !check.ready).map((check) => check.code))
      .toEqual(['map', 'payment', 'quota', 'apiDomain', 'supportContact', 'salesContact']);
  });
});
