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
