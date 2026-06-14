import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { UserService } from './user.service';
import { Role, type AuthUser } from '@nongchang/shared';

const ctx = (o: Partial<AuthUser>): AuthUser => ({ userId: 'u', tenantId: 't1', role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null, ...o });

describe('UserService.list #27', () => {
  it('agent_admin 有 agentId:where 含 agentId', () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    new UserService(prisma).list(ctx({ agentId: 'a1' }));
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', agentId: 'a1' });
  });
  it('agent_admin 缺 agentId:抛 Forbidden(不查库)', () => {
    const prisma = { user: { findMany: vi.fn() } } as any;
    expect(() => new UserService(prisma).list(ctx({ agentId: null }))).toThrow(ForbiddenException);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
  it('system_admin:where 仅 tenantId(允许整租户)', () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    new UserService(prisma).list(ctx({ role: Role.SYSTEM_ADMIN, agentId: null }));
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1' });
  });
});

describe('UserService.listPending', () => {
  it('system_admin:查本租户 status=pending', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    await new UserService(prisma).listPending(ctx({ role: Role.SYSTEM_ADMIN, agentId: null }));
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', status: 'pending' });
  });
  it('agent_admin:where 含 agentId + status pending', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    await new UserService(prisma).listPending(ctx({ agentId: 'a1' }));
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', agentId: 'a1', status: 'pending' });
  });
  it('agent_admin 缺 agentId:抛 Forbidden(不查库)', async () => {
    const prisma = { user: { findMany: vi.fn() } } as any;
    await expect(new UserService(prisma).listPending(ctx({ agentId: null }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe('UserService.review', () => {
  const pendingUser = { id: 'p1', tenantId: 't1', agentId: 'a1', status: 'pending' };
  it('approve:目标在范围内 → status 置 active', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue(pendingUser), update: vi.fn().mockResolvedValue({}) } } as any;
    await new UserService(prisma).review(ctx({ role: Role.SYSTEM_ADMIN, agentId: null }), 'p1', { action: 'approve' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' }, data: { status: 'active' } }));
  });
  it('reject:status 置 rejected', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue(pendingUser), update: vi.fn().mockResolvedValue({}) } } as any;
    await new UserService(prisma).review(ctx({ role: Role.SYSTEM_ADMIN, agentId: null }), 'p1', { action: 'reject' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' }, data: { status: 'rejected' } }));
  });
  it('目标不在范围(跨租户/跨 agent)→ 抛 Forbidden,不更新', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() } } as any;
    await expect(new UserService(prisma).review(ctx({ agentId: 'a1' }), 'pX', { action: 'approve' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('agent_admin 缺 agentId:抛 Forbidden(不查库)', async () => {
    const prisma = { user: { findFirst: vi.fn(), update: vi.fn() } } as any;
    await expect(new UserService(prisma).review(ctx({ agentId: null }), 'p1', { action: 'approve' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
