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
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true, username: true, role: true, agentId: true, displayName: true },
    });
  });
  it('system_admin 查询全租户 merchant(不限 agentId)', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    const svc = new AgentService(prisma, new ScopeService());
    await svc.listMerchants(ctx({ role: Role.SYSTEM_ADMIN, agentId: null }));
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', role: Role.MERCHANT },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true, username: true, role: true, agentId: true, displayName: true },
    });
  });

  it('returns a paginated envelope when merchants are requested with page/pageSize', async () => {
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm2', username: 'merchant-b', role: Role.MERCHANT, agentId: 'a1', displayName: 'Merchant B' },
        ]),
        count: vi.fn().mockResolvedValue(3),
      },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    } as any;
    const svc = new AgentService(prisma, new ScopeService());

    const result = await svc.listMerchants(ctx({}), { page: 2, pageSize: 1 });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', role: Role.MERCHANT, agentId: 'a1' },
      orderBy: { createdAt: 'desc' },
      skip: 1,
      take: 1,
      select: { id: true, username: true, role: true, agentId: true, displayName: true },
    });
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', role: Role.MERCHANT, agentId: 'a1' },
    });
    expect(result).toEqual({
      items: [{ id: 'm2', username: 'merchant-b', role: Role.MERCHANT, agentId: 'a1', displayName: 'Merchant B' }],
      total: 3,
      page: 2,
      pageSize: 1,
    });
  });
  it('agent_admin 缺 agentId: 抛 Forbidden(不查库)', () => {
    const prisma = { user: { findMany: vi.fn() } } as any;
    const svc = new AgentService(prisma, new ScopeService());
    expect(() => svc.listMerchants(ctx({ agentId: null }))).toThrow(ForbiddenException);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe('AgentService 管理能力', () => {
  const sysAdmin = ctx({ role: Role.SYSTEM_ADMIN, agentId: null });

  function makePrisma() {
    const prisma = {
      agent: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      user: { updateMany: vi.fn() },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    } as any;
    return prisma;
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
      select: expect.anything(),
    });
  });

  it('setStatus 改 status', async () => {
    const prisma = makePrisma();
    prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.agent.update.mockResolvedValue({ id: 'a1', status: 'suspended' });
    prisma.user.updateMany.mockResolvedValue({ count: 2 });
    const svc = new AgentService(prisma, new ScopeService());
    const r = await svc.setStatus(sysAdmin, 'a1', 'suspended');
    expect(r.status).toBe('suspended');
  });

  it('setStatus suspended increments sessionVersion for users assigned to the agent', async () => {
    const prisma = makePrisma();
    prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.agent.update.mockResolvedValue({ id: 'a1', status: 'suspended' });
    prisma.user.updateMany.mockResolvedValue({ count: 2 });
    const svc = new AgentService(prisma, new ScopeService());

    await svc.setStatus(sysAdmin, 'a1', 'suspended');

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', agentId: 'a1' },
      data: { sessionVersion: { increment: 1 } },
    });
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

  it('list returns a paginated envelope when page/pageSize are provided', async () => {
    const prisma = makePrisma();
    prisma.agent.findMany.mockResolvedValue([
      { id: 'a2', name: '代理2', region: '华南', status: 'active', createdAt: new Date('2026-01-02'), _count: { users: 4 } },
    ]);
    prisma.agent.count.mockResolvedValue(3);
    const svc = new AgentService(prisma, new ScopeService());

    const result = await svc.list(sysAdmin, { page: 2, pageSize: 1 });

    expect(prisma.agent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 't1' },
      skip: 1,
      take: 1,
    }));
    expect(prisma.agent.count).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
    expect(result).toEqual({
      items: [{ id: 'a2', name: '代理2', region: '华南', status: 'active', createdAt: new Date('2026-01-02').toISOString(), merchantCount: 4 }],
      total: 3,
      page: 2,
      pageSize: 1,
    });
  });
});
