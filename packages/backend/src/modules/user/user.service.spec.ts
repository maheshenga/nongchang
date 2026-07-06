import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { UserService } from './user.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, createUserSchema, type AuthUser } from '@nongchang/shared';

const ctx = (o: Partial<AuthUser>): AuthUser => ({ userId: 'u', tenantId: 't1', role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null, ...o });

describe('UserService.list #27', () => {
  it('agent_admin 有 agentId:where 含 agentId', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    await new UserService(prisma, new ScopeService()).list(ctx({ agentId: 'a1' }));
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', agentId: 'a1' });
  });
  it('agent_admin 缺 agentId:抛 Forbidden(不查库)', async () => {
    const prisma = { user: { findMany: vi.fn() } } as any;
    await expect(new UserService(prisma, new ScopeService()).list(ctx({ agentId: null }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
  it('system_admin:where 仅 tenantId(允许整租户)', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    await new UserService(prisma, new ScopeService()).list(ctx({ role: Role.SYSTEM_ADMIN, agentId: null }));
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1' });
  });
});

describe('UserService.listPending', () => {
  it('system_admin:查本租户 status=pending', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    await new UserService(prisma, new ScopeService()).listPending(ctx({ role: Role.SYSTEM_ADMIN, agentId: null }));
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', role: Role.MERCHANT, status: 'pending' });
    expect(prisma.user.findMany.mock.calls[0][0].take).toBe(500);
  });
  it('agent_admin:where 含 agentId + status pending', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    await new UserService(prisma, new ScopeService()).listPending(ctx({ agentId: 'a1' }));
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', role: Role.MERCHANT, agentId: 'a1', status: 'pending' });
  });
  it('agent_admin 缺 agentId:抛 Forbidden(不查库)', async () => {
    const prisma = { user: { findMany: vi.fn() } } as any;
    await expect(new UserService(prisma, new ScopeService()).listPending(ctx({ agentId: null }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
  it('page/pageSize returns a paginated pending-user envelope', async () => {
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'p2', displayName: 'Pending B', phone: '13800000002', createdAt: new Date('2026-07-06T00:00:00.000Z') },
        ]),
        count: vi.fn().mockResolvedValue(3),
      },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    } as any;
    const result = await new UserService(prisma, new ScopeService()).listPending(
      ctx({ role: Role.SYSTEM_ADMIN, agentId: null }),
      { page: 2, pageSize: 1 },
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', role: Role.MERCHANT, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      skip: 1,
      take: 1,
      select: { id: true, displayName: true, phone: true, createdAt: true },
    });
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', role: Role.MERCHANT, status: 'pending' },
    });
    expect(result).toEqual({
      items: [{ id: 'p2', displayName: 'Pending B', phone: '13800000002', createdAt: new Date('2026-07-06T00:00:00.000Z') }],
      total: 3,
      page: 2,
      pageSize: 1,
    });
  });
});

describe('UserService.review', () => {
  const pendingUser = { id: 'p1', tenantId: 't1', agentId: 'a1', status: 'pending' };
  it('approve:目标在范围内 → status 置 active', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue(pendingUser), update: vi.fn().mockResolvedValue({}) } } as any;
    await new UserService(prisma, new ScopeService()).review(ctx({ role: Role.SYSTEM_ADMIN, agentId: null }), 'p1', { action: 'approve' });
    expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 't1', id: 'p1', role: Role.MERCHANT, status: 'pending' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' }, data: { status: 'active' } }));
  });
  it('reject:status 置 rejected', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue(pendingUser), update: vi.fn().mockResolvedValue({}) } } as any;
    await new UserService(prisma, new ScopeService()).review(ctx({ role: Role.SYSTEM_ADMIN, agentId: null }), 'p1', { action: 'reject' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' }, data: { status: 'rejected' } }));
  });
  it('目标不在范围(跨租户/跨 agent)→ 抛 Forbidden,不更新', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() } } as any;
    await expect(new UserService(prisma, new ScopeService()).review(ctx({ agentId: 'a1' }), 'pX', { action: 'approve' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('agent_admin 缺 agentId:抛 Forbidden(不查库)', async () => {
    const prisma = { user: { findFirst: vi.fn(), update: vi.fn() } } as any;
    await expect(new UserService(prisma, new ScopeService()).review(ctx({ agentId: null }), 'p1', { action: 'approve' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});

describe('UserService 管理能力(商户管理)', () => {
  const sysAdmin = ctx({ role: Role.SYSTEM_ADMIN, agentId: null });

  function makePrisma() {
    return {
      user: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
      field: { groupBy: vi.fn() },
    } as any;
  }

  it('update 目标不在范围内抛 Forbidden', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst.mockResolvedValue(null);
    const svc = new UserService(prisma, new ScopeService());
    await expect(svc.update(sysAdmin, 'm1', { displayName: '新名字' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('update 在范围内则更新 displayName/phone', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.user.update.mockResolvedValue({ id: 'm1', displayName: '新名字' });
    const svc = new UserService(prisma, new ScopeService());
    await svc.update(sysAdmin, 'm1', { displayName: '新名字', phone: null });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'm1' }, data: { displayName: '新名字', phone: null },
      select: expect.anything(),
    });
  });

  it('setStatus 在范围内则改 status', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.user.update.mockResolvedValue({ id: 'm1', status: 'suspended' });
    const svc = new UserService(prisma, new ScopeService());
    const r = await svc.setStatus(sysAdmin, 'm1', 'suspended');
    expect(r.status).toBe('suspended');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { status: 'suspended', sessionVersion: { increment: 1 } },
      select: { id: true, status: true },
    });
  });

  it('setStatus 对 pending/不在范围的目标抛 Forbidden', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst.mockResolvedValue(null);
    const svc = new UserService(prisma, new ScopeService());
    await expect(svc.setStatus(sysAdmin, 'mp', 'active'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('setStatus active does not expose sessionVersion', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.user.update.mockResolvedValue({ id: 'm1', status: 'active' });
    const svc = new UserService(prisma, new ScopeService());

    const r = await svc.setStatus(sysAdmin, 'm1', 'active');

    expect(r).toEqual({ id: 'm1', status: 'active' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { status: 'active' },
      select: { id: true, status: true },
    });
  });

  it('create 生成随机初始密码并返回 initialPassword', async () => {
    const prisma = makePrisma();
    prisma.user.create.mockResolvedValue({ id: 'm9', username: 'u9', role: 'merchant', agentId: null, displayName: '商户9' });
    const svc = new UserService(prisma, new ScopeService());
    const r = await svc.create(sysAdmin, { username: 'u9', password: 'ignored', role: Role.MERCHANT, displayName: '商户9' } as any);
    expect(typeof r.initialPassword).toBe('string');
    expect(r.initialPassword.length).toBeGreaterThan(6);
  });

  it('createUserSchema 不接受 password 假字段', () => {
    const parsed = createUserSchema.safeParse({
      username: 'u9',
      password: 'ignored',
      role: Role.MERCHANT,
      displayName: '商户9',
    });
    expect(parsed.success).toBe(false);
  });

  it('createUserSchema accepts ordinary member role', () => {
    const parsed = createUserSchema.safeParse({
      username: 'member9',
      role: Role.MEMBER,
      displayName: 'Member 9',
    });
    expect(parsed.success).toBe(true);
  });

  it('listMerchants 聚合 fieldCount/totalArea', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([
      { id: 'm1', username: 'u1', displayName: '商户1', phone: null, status: 'active', agentId: null, createdAt: new Date('2026-01-01') },
    ]);
    prisma.field.groupBy.mockResolvedValue([{ ownerId: 'm1', _count: { _all: 3 }, _sum: { area: 12.5 } }]);
    const svc = new UserService(prisma, new ScopeService());
    const rows = await svc.listMerchants(sysAdmin);
    expect((rows as any[])[0]).toMatchObject({ id: 'm1', fieldCount: 3, totalArea: 12.5 });
  });

  it('rejects agent_admin merchant creation when actor agentId is missing', async () => {
    const prisma = makePrisma();
    const svc = new UserService(prisma, new ScopeService());
    await expect(svc.create(ctx({ agentId: null }), {
      username: 'm10',
      role: Role.MERCHANT,
      displayName: 'Merchant 10',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('system_admin validates create dto agentId belongs to the current tenant', async () => {
    const prisma = makePrisma();
    prisma.agent = { findFirst: vi.fn().mockResolvedValue(null) };
    const svc = new UserService(prisma, new ScopeService());
    await expect(svc.create(sysAdmin, {
      username: 'm11',
      role: Role.MERCHANT,
      agentId: '00000000-0000-0000-0000-000000000011',
      displayName: 'Merchant 11',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.agent.findFirst).toHaveBeenCalledWith({
      where: { id: '00000000-0000-0000-0000-000000000011', tenantId: 't1' },
      select: { id: true },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('system_admin creates member with null agentId even when dto includes agentId', async () => {
    const prisma = makePrisma();
    prisma.user.create.mockResolvedValue({
      id: 'mem1',
      username: 'member1',
      role: Role.MEMBER,
      agentId: null,
      displayName: 'Member 1',
    });
    const svc = new UserService(prisma, new ScopeService());

    await svc.create(sysAdmin, {
      username: 'member1',
      role: Role.MEMBER,
      agentId: '00000000-0000-0000-0000-000000000011',
      displayName: 'Member 1',
    });

    expect(prisma.agent?.findFirst).toBeUndefined();
    expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 't1',
      role: Role.MEMBER,
      agentId: null,
      username: 'member1',
      displayName: 'Member 1',
    });
  });

  it('agent_admin cannot create ordinary members', async () => {
    const prisma = makePrisma();
    const svc = new UserService(prisma, new ScopeService());

    await expect(svc.create(ctx({ agentId: 'a1' }), {
      username: 'member2',
      role: Role.MEMBER,
      displayName: 'Member 2',
    })).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('list includes members for tenant admins without treating them as merchants', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([
      { id: 'mem1', username: 'member1', role: Role.MEMBER, agentId: null, displayName: 'Member 1', status: 'active' },
    ]);
    const svc = new UserService(prisma, new ScopeService());

    const rows = await svc.list(sysAdmin);

    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1' });
    expect((rows as any[])[0].role).toBe(Role.MEMBER);
  });

  it('listMerchants excludes ordinary members', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.field.groupBy.mockResolvedValue([]);
    const svc = new UserService(prisma, new ScopeService());

    await svc.listMerchants(sysAdmin);

    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1',
      role: Role.MERCHANT,
      status: { not: 'pending' },
    });
  });
});
