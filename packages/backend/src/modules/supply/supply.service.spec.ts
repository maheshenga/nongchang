import { describe, it, expect } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupplyService } from './supply.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, type AuthUser } from '@nongchang/shared';

const sysadmin: AuthUser = { userId: 'u1', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const merchant: AuthUser = { userId: 'u2', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const BATCH = '11111111-1111-1111-1111-111111111111';

function makeService(overrides: any = {}) {
  // 事务内以可变状态模拟条件原子自增:updateMany 仅在 used<=total-amount 时命中(count=1),
  // 否则 count=0(超量熔断)。findUnique 返回最新行,用于计算 remaining。
  const state: any = { total: 0, used: 0 };
  const prisma = {
    supply: {
      findMany: async () => [], findFirst: async () => null,
      create: async (a: any) => ({ id: 's-new', ...a.data, createdAt: new Date('2026-06-14T10:00:00Z') }),
      delete: async () => ({}),
      ...(overrides.supply ?? {}),
    },
    $transaction: async (fn: any) => fn({
      supply: {
        updateMany: async (a: any) => {
          const lte = a.where.used.lte;
          if (state.used <= lte) { state.used += a.data.used.increment; return { count: 1 }; }
          return { count: 0 };
        },
        findUnique: async () => ({ total: state.total, used: state.used }),
      },
      supplyIssue: { create: async (a: any) => a.data },
    }),
  };
  return { svc: new SupplyService(prisma as any, new ScopeService()), prisma, state };
}

describe('SupplyService.list', () => {
  it('sysadmin 按 tenantId 过滤并计算 remaining/alert', async () => {
    let captured: any;
    const { svc } = makeService({ supply: { findMany: async (a: any) => { captured = a; return [
      { id: 's1', name: '复合肥', unit: '包', total: 100, used: 95, createdAt: new Date('2026-06-14T10:00:00Z') },
    ]; } } });
    const res = await svc.list(sysadmin);
    expect(captured.where).toEqual({ tenantId: 't1' });
    expect(captured.orderBy).toEqual({ createdAt: 'desc' });
    expect(res[0]).toEqual({ id: 's1', name: '复合肥', unit: '包', total: 100, used: 95, remaining: 5, alert: true, createdAt: '2026-06-14T10:00:00.000Z' });
  });
  it('merchant 注入 ownerId 过滤', async () => {
    let captured: any;
    const { svc } = makeService({ supply: { findMany: async (a: any) => { captured = a; return []; } } });
    await svc.list(merchant);
    expect(captured.where).toEqual({ tenantId: 't1', ownerId: 'm1' });
  });
  it('merchant 缺 ownerId fail-closed 抛 Forbidden', async () => {
    const { svc } = makeService();
    await expect(svc.list({ userId: 'u', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: null } as AuthUser))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SupplyService.create', () => {
  it('merchant 强制 ownerId=self,total=amount,used=0', async () => {
    let captured: any;
    const { svc } = makeService({ supply: { create: async (a: any) => { captured = a; return { id: 's-new', ...a.data, createdAt: new Date('2026-06-14T10:00:00Z') }; } } });
    await svc.create(merchant, { name: '尿素', unit: '袋', amount: 50 });
    expect(captured.data.ownerId).toBe('m1');
    expect(captured.data.tenantId).toBe('t1');
    expect(captured.data.total).toBe(50);
    expect(captured.data.used).toBe(0);
  });
});

describe('SupplyService.issue', () => {
  it('正常领用:事务内条件自增 used 且写 SupplyIssue,返回 remaining', async () => {
    const { svc, state } = makeService({
      supply: { findFirst: async () => ({ id: 's1', ownerId: 'm1', tenantId: 't1', total: 100, used: 20 }) },
    });
    state.total = 100; state.used = 20;
    const res = await svc.issue(merchant, 's1', { batchId: BATCH, amount: 30 });
    expect(res).toEqual({ supplyId: 's1', used: 50, remaining: 50 });
  });
  it('超量(amount>remaining)条件自增不命中抛 BadRequest,库存不变', async () => {
    const { svc, state } = makeService({
      supply: { findFirst: async () => ({ id: 's1', ownerId: 'm1', tenantId: 't1', total: 100, used: 95 }) },
    });
    state.total = 100; state.used = 95;
    await expect(svc.issue(merchant, 's1', { batchId: BATCH, amount: 30 }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(state.used).toBe(95);
  });
  it('越权(supply 不在作用域)抛 Forbidden', async () => {
    const { svc } = makeService({ supply: { findFirst: async () => null } });
    await expect(svc.issue(merchant, 'other', { batchId: BATCH, amount: 1 }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SupplyService.remove', () => {
  it('作用域内删除成功', async () => {
    let deleted: any;
    const { svc } = makeService({
      supply: { findFirst: async () => ({ id: 's1', ownerId: 'm1' }), delete: async (a: any) => { deleted = a; return {}; } },
    });
    await svc.remove(merchant, 's1');
    expect(deleted.where).toEqual({ id: 's1' });
  });
  it('越权删除抛 Forbidden', async () => {
    const { svc } = makeService({ supply: { findFirst: async () => null } });
    await expect(svc.remove(merchant, 'other')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
