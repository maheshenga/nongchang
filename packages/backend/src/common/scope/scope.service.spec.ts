import { describe, it, expect, vi } from 'vitest';
import { ScopeService } from './scope.service';
import { Role } from '@nongchang/shared';

const svc = new ScopeService();
const ctx = (over: Partial<any>) => ({ userId: 'u', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: null, ...over });

describe('ScopeService.ownedWhere', () => {
  it('system_admin 仅按 tenantId 过滤', () => {
    expect(svc.ownedWhere(ctx({ role: Role.SYSTEM_ADMIN, ownerId: null }))).toEqual({ tenantId: 't1' });
  });
  it('agent_admin 按 tenantId + agentId 过滤', () => {
    expect(svc.ownedWhere(ctx({ role: Role.AGENT_ADMIN, agentId: 'a1' }))).toEqual({ tenantId: 't1', agentId: 'a1' });
  });
  it('merchant 按 tenantId + ownerId 过滤', () => {
    expect(svc.ownedWhere(ctx({ role: Role.MERCHANT, ownerId: 'm1' }))).toEqual({ tenantId: 't1', ownerId: 'm1' });
  });
  it('agent_admin 缺失 agentId 时拒绝(不退化为整租户可见)', () => {
    expect(() => svc.ownedWhere(ctx({ role: Role.AGENT_ADMIN, agentId: null }))).toThrow();
  });
  it('merchant 缺失 ownerId 时拒绝(不退化为整租户可见)', () => {
    expect(() => svc.ownedWhere(ctx({ role: Role.MERCHANT, ownerId: null }))).toThrow();
  });
  it('未知角色拒绝(不退化为整租户可见)', () => {
    expect(() => svc.ownedWhere(ctx({ role: 'superuser' as any, agentId: null, ownerId: null }))).toThrow();
  });
});

describe('ScopeService.merchantIdsForAgent', () => {
  it('查询某 agent 下所有 merchant 的 id', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]) } } as any;
    const s = new ScopeService();
    const ids = await s.merchantIdsForAgent(prisma, 't1', 'a1');
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', role: 'merchant', agentId: 'a1' }, select: { id: true },
    });
    expect(ids).toEqual(['m1', 'm2']);
  });
});

describe('ScopeService.ownedScopeWhere 失败关闭', () => {
  it('merchant 缺少 ownerId 时抛错(不退化为整租户可见)', async () => {
    const prisma = { user: { findMany: vi.fn() } } as any;
    const s = new ScopeService();
    await expect(
      s.ownedScopeWhere(prisma, ctx({ role: Role.MERCHANT, agentId: null, ownerId: null })),
    ).rejects.toThrow();
  });
  it('agent_admin 缺少 agentId 时抛错(不退化为整租户可见)', async () => {
    const prisma = { user: { findMany: vi.fn() } } as any;
    const s = new ScopeService();
    await expect(
      s.ownedScopeWhere(prisma, ctx({ role: Role.AGENT_ADMIN, agentId: null, ownerId: null })),
    ).rejects.toThrow();
  });
  it('system_admin 仍只按 tenantId 过滤(允许整租户)', async () => {
    const prisma = { user: { findMany: vi.fn() } } as any;
    const s = new ScopeService();
    const where = await s.ownedScopeWhere(prisma, ctx({ role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null }));
    expect(where).toEqual({ tenantId: 't1' });
  });
});

describe('ScopeService.assertInScope', () => {
  const merchant = ctx({ role: Role.MERCHANT, ownerId: 'm1' });
  it('实体在范围内:通过', async () => {
    const prisma = { batch: { findFirst: vi.fn().mockResolvedValue({ id: 'b1' }) } } as any;
    await expect(new ScopeService().assertInScope(prisma, merchant, 'batch', 'b1')).resolves.toBeUndefined();
    expect(prisma.batch.findFirst).toHaveBeenCalledWith({
      where: { id: 'b1', tenantId: 't1', ownerId: 'm1' }, select: { id: true },
    });
  });
  it('实体不在范围内:抛 Forbidden', async () => {
    const prisma = { field: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    await expect(new ScopeService().assertInScope(prisma, merchant, 'field', 'f9'))
      .rejects.toThrow();
  });
  it('merchant 缺 ownerId:fail-closed 抛错(不查库)', async () => {
    const prisma = { batch: { findFirst: vi.fn() } } as any;
    await expect(new ScopeService().assertInScope(prisma, ctx({ role: Role.MERCHANT, ownerId: null }), 'batch', 'b1'))
      .rejects.toThrow();
    expect(prisma.batch.findFirst).not.toHaveBeenCalled();
  });
});

describe('ScopeService.assertOwnerInScope', () => {
  it('merchant 自身 ownerId 命中:通过', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }) } } as any;
    await expect(new ScopeService().assertOwnerInScope(prisma, ctx({ role: Role.MERCHANT, ownerId: 'm1' }), 'm1'))
      .resolves.toBeUndefined();
  });
  it('目标 owner 不在范围:抛 Forbidden', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    await expect(new ScopeService().assertOwnerInScope(prisma, ctx({ role: Role.SYSTEM_ADMIN, ownerId: null }), 'mX'))
      .rejects.toThrow();
  });
  it('sysadmin 校验:where 不含 ownerId 维度约束,仅锁 id+role+tenantId', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue({ id: 'mX' }) } } as any;
    await new ScopeService().assertOwnerInScope(prisma, ctx({ role: Role.SYSTEM_ADMIN, ownerId: null }), 'mX');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ id: 'mX', role: Role.MERCHANT, tenantId: 't1' }, {}] }, select: { id: true },
    });
  });
});

describe('ScopeService.resolveOwnerId', () => {
  it('merchant:忽略 dto.ownerId,强制返回 self', async () => {
    const prisma = { user: { findFirst: vi.fn() } } as any;
    const id = await new ScopeService().resolveOwnerId(prisma, ctx({ role: Role.MERCHANT, ownerId: 'm1' }), 'someoneElse');
    expect(id).toBe('m1');
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
  it('merchant 缺 ownerId:抛错', async () => {
    const prisma = { user: { findFirst: vi.fn() } } as any;
    await expect(new ScopeService().resolveOwnerId(prisma, ctx({ role: Role.MERCHANT, ownerId: null }), 'x'))
      .rejects.toThrow();
  });
  it('agent:采纳 dto.ownerId,但须经 assertOwnerInScope 校验(命中)', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }), findMany: vi.fn().mockResolvedValue([{ id: 'm1' }]) } } as any;
    const id = await new ScopeService().resolveOwnerId(prisma, ctx({ role: Role.AGENT_ADMIN, agentId: 'a1' }), 'm1');
    expect(id).toBe('m1');
  });
  it('agent:dto.ownerId 不在范围:抛错', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) } } as any;
    await expect(new ScopeService().resolveOwnerId(prisma, ctx({ role: Role.AGENT_ADMIN, agentId: 'a1' }), 'mX'))
      .rejects.toThrow();
  });
});
