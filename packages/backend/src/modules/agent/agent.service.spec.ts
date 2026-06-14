import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AgentService } from './agent.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role } from '@nongchang/shared';

const ctx = (o: Partial<any>) => ({ userId: 'u', tenantId: 't1', role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null, ...o });

describe('AgentService.listMerchants', () => {
  it('agent_admin 仅查询自己 agentId 下的 merchant', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    const svc = new AgentService(prisma, new ScopeService());
    await svc.listMerchants(ctx({}));
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', role: Role.MERCHANT, agentId: 'a1' },
    });
  });
  it('system_admin 查询全租户 merchant(不限 agentId)', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    const svc = new AgentService(prisma, new ScopeService());
    await svc.listMerchants(ctx({ role: Role.SYSTEM_ADMIN, agentId: null }));
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', role: Role.MERCHANT },
    });
  });
  it('agent_admin 缺 agentId:抛 Forbidden(不查库)', () => {
    const prisma = { user: { findMany: vi.fn() } } as any;
    const svc = new AgentService(prisma, new ScopeService());
    expect(() => svc.listMerchants(ctx({ agentId: null }))).toThrow(ForbiddenException);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
