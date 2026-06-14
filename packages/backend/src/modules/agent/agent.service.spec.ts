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

describe('AgentService 管理能力', () => {
  const sysAdmin = ctx({ role: Role.SYSTEM_ADMIN, agentId: null });

  function makePrisma() {
    return { agent: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() } } as any;
  }

  it('update 目标不在租户内抛 Forbidden', async () => {
    const prisma = makePrisma();
    prisma.agent.findFirst.mockResolvedValue(null);
    const svc = new AgentService(prisma, new ScopeService());
    await expect(svc.update(sysAdmin, 'a1', { name: '新代理' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('update 在租户内则更新', async () => {
    const prisma = makePrisma();
    prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.agent.update.mockResolvedValue({ id: 'a1', name: '新代理', region: '华东' });
    const svc = new AgentService(prisma, new ScopeService());
    await svc.update(sysAdmin, 'a1', { name: '新代理', region: '华东' });
    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: 'a1' }, data: { name: '新代理', region: '华东' },
    });
  });

  it('setStatus 改 status', async () => {
    const prisma = makePrisma();
    prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.agent.update.mockResolvedValue({ id: 'a1', status: 'suspended' });
    const svc = new AgentService(prisma, new ScopeService());
    const r = await svc.setStatus(sysAdmin, 'a1', 'suspended');
    expect(r.status).toBe('suspended');
  });

  it('list 带 merchantCount', async () => {
    const prisma = makePrisma();
    prisma.agent.findMany.mockResolvedValue([
      { id: 'a1', name: '代理1', region: '华东', status: 'active', createdAt: new Date('2026-01-01'), _count: { users: 5 } },
    ]);
    const svc = new AgentService(prisma, new ScopeService());
    const rows = await svc.list(sysAdmin);
    expect(rows[0]).toMatchObject({ id: 'a1', merchantCount: 5 });
  });
});
