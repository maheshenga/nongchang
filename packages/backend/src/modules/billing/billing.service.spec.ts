import { describe, it, expect } from 'vitest';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { Role, type AuthUser } from '@nongchang/shared';

const sysadmin: AuthUser = { userId: 'u1', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const agent: AuthUser = { userId: 'u2', tenantId: 't1', role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null };
const merchant: AuthUser = { userId: 'u3', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };

function makeService(opts: { aiBalance?: number; codeBalance?: number; account?: any } = {}) {
  const state: any = { aiBalance: opts.aiBalance ?? 0, codeBalance: opts.codeBalance ?? 0 };
  const ledgers: any[] = [];
  const accountRow = opts.account ?? { id: 'acc1', ownerType: 'MERCHANT', ownerId: 'm1', tenantId: 't1' };
  const tx = {
    creditAccount: {
      updateMany: async (a: any) => {
        const field = a.data.aiBalance ? 'aiBalance' : 'codeBalance';
        const op = a.data.aiBalance ?? a.data.codeBalance;
        if (op.increment != null) { state[field] += op.increment; return { count: 1 }; }
        const dec = op.decrement;
        const min = field === 'aiBalance' ? a.where.aiBalance.gte : a.where.codeBalance.gte;
        if (state[field] >= min) { state[field] -= dec; return { count: 1 }; }
        return { count: 0 };
      },
      update: async (a: any) => {
        const field = a.data.aiBalance ? 'aiBalance' : 'codeBalance';
        state[field] += (a.data.aiBalance ?? a.data.codeBalance).increment;
        return { ...accountRow, ...state };
      },
      findFirst: async () => ({ ...accountRow, ...state }),
      findUnique: async () => ({ ...accountRow, ...state }),
    },
    creditLedger: { create: async (a: any) => { ledgers.push(a.data); return a.data; } },
  };
  const prisma: any = {
    ...tx,
    $transaction: async (fn: any) => fn(tx),
  };
  const svc = new BillingService(prisma);
  return { svc, state, ledgers, prisma };
}

describe('BillingService.consume', () => {
  it('余额充足:AI 扣减并写 CONSUME 流水', async () => {
    const { svc, state, ledgers } = makeService({ aiBalance: 10 });
    await svc.consume(merchant, 'AI', 3, { refType: 'ai.diagnose' });
    expect(state.aiBalance).toBe(7);
    expect(ledgers[0]).toMatchObject({ resource: 'AI', delta: -3, balanceAfter: 7, reason: 'CONSUME', refType: 'ai.diagnose' });
  });
  it('余额不足:抛 Forbidden 且余额不变、无流水', async () => {
    const { svc, state, ledgers } = makeService({ aiBalance: 2 });
    await expect(svc.consume(merchant, 'AI', 3, { refType: 'ai.diagnose' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(state.aiBalance).toBe(2);
    expect(ledgers).toHaveLength(0);
  });
  it('merchant 缺 ownerId fail-closed', async () => {
    const { svc } = makeService({ aiBalance: 10 });
    const bad = { ...merchant, ownerId: null } as AuthUser;
    await expect(svc.consume(bad, 'AI', 1, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('BillingService.refund', () => {
  it('退款:余额增加并写 REFUND 流水(正 delta)', async () => {
    const { svc, state, ledgers } = makeService({ aiBalance: 7 });
    await svc.refund(merchant, 'AI', 3, { refType: 'ai.transcribe' });
    expect(state.aiBalance).toBe(10);
    expect(ledgers[0]).toMatchObject({ resource: 'AI', delta: 3, balanceAfter: 10, reason: 'REFUND', refType: 'ai.transcribe' });
  });
});

describe('BillingService.allocate', () => {
  it('总量守恒:转出 -N(ALLOCATE_OUT)+ 转入 +N(ALLOCATE_IN)', async () => {
    const fromState: any = { aiBalance: 100, codeBalance: 0 };
    const toState: any = { aiBalance: 0, codeBalance: 0 };
    const ledgers: any[] = [];
    const accounts: Record<string, any> = {
      PLATFORM: { id: 'accP', ownerType: 'PLATFORM', ownerId: 'PLATFORM', tenantId: 't1', state: fromState },
      a1: { id: 'accA', ownerType: 'AGENT', ownerId: 'a1', tenantId: 't1', state: toState },
    };
    const tx: any = {
      creditAccount: {
        updateMany: async (a: any) => {
          const acc = a.where.id === 'accP' ? fromState : toState;
          if (a.data.aiBalance?.decrement != null) {
            if (acc.aiBalance >= a.where.aiBalance.gte) { acc.aiBalance -= a.data.aiBalance.decrement; return { count: 1 }; }
            return { count: 0 };
          }
          acc.aiBalance += a.data.aiBalance.increment; return { count: 1 };
        },
        findUnique: async (a: any) => (a.where.id === 'accP' ? { ...accounts.PLATFORM, ...fromState } : { ...accounts.a1, ...toState }),
        findFirst: async (a: any) => {
          const ot = a.where.ownerType, oi = a.where.ownerId;
          if (ot === 'PLATFORM') return { ...accounts.PLATFORM, ...fromState };
          if (oi === 'a1') return { ...accounts.a1, ...toState };
          return null;
        },
        create: async (a: any) => ({ id: 'accNew', ...a.data }),
      },
      creditLedger: { create: async (a: any) => { ledgers.push(a.data); return a.data; } },
    };
    const prisma: any = { ...tx, $transaction: async (fn: any) => fn(tx),
      user: { findFirst: async () => ({ id: 'a1' }) },
      agent: { findFirst: async () => ({ id: 'a1' }) } };
    const { BillingService } = await import('./billing.service');
    const svc = new BillingService(prisma);
    await svc.allocate(sysadmin, { targetOwnerType: 'AGENT', targetOwnerId: 'a1', resource: 'AI', amount: 30 });
    expect(fromState.aiBalance).toBe(70);
    expect(toState.aiBalance).toBe(30);
    const out = ledgers.find((l) => l.reason === 'ALLOCATE_OUT');
    const inn = ledgers.find((l) => l.reason === 'ALLOCATE_IN');
    expect(out.delta + inn.delta).toBe(0);
  });
});

describe('BillingService.summary', () => {
  it('返回当前用户账户余额', async () => {
    const prisma: any = {
      creditAccount: {
        findFirst: async () => ({ id: 'acc1', ownerType: 'MERCHANT', ownerId: 'm1', aiBalance: 5, codeBalance: 8 }),
        findUnique: async () => ({ id: 'acc1', ownerType: 'MERCHANT', ownerId: 'm1', aiBalance: 5, codeBalance: 8 }),
        create: async () => ({}),
      },
    };
    const { BillingService } = await import('./billing.service');
    const svc = new BillingService(prisma);
    const s = await svc.summary(merchant);
    expect(s).toEqual({ ownerType: 'MERCHANT', ownerId: 'm1', aiBalance: 5, codeBalance: 8 });
  });
});

describe('BillingService 套餐管理', () => {
  function planPrisma(initial: any[] = []) {
    const plans = [...initial];
    let seq = initial.length;
    return {
      creditPlan: {
        findMany: async (a: any) => plans.filter((p) => p.tenantId === a.where.tenantId && (a.where.active === undefined || p.active === a.where.active)),
        findFirst: async (a: any) => plans.find((p) => p.id === a.where.id && p.tenantId === a.where.tenantId) ?? null,
        create: async (a: any) => { const row = { id: `p${++seq}`, createdAt: new Date(), ...a.data }; plans.push(row); return row; },
        update: async (a: any) => { const row = plans.find((p) => p.id === a.where.id); Object.assign(row, a.data); return row; },
        delete: async (a: any) => { const i = plans.findIndex((p) => p.id === a.where.id); plans.splice(i, 1); return {}; },
      },
      creditOrder: { count: async () => 0 },
    } as any;
  }

  it('createPlan:仅 SYSTEM_ADMIN 可建', async () => {
    const svc = new BillingService(planPrisma());
    await expect(svc.createPlan(merchant, { name: 'x', resource: 'AI', quantity: 100, priceCents: 1000, isUnit: false, active: true })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('createPlan + listPlans:管理员建套餐后可见', async () => {
    const svc = new BillingService(planPrisma());
    const p = await svc.createPlan(sysadmin, { name: 'AI100', resource: 'AI', quantity: 100, priceCents: 1000, isUnit: false, active: true });
    expect(p.name).toBe('AI100');
    const list = await svc.listPlans(sysadmin);
    expect(list).toHaveLength(1);
  });

  it('listPlans:购买方仅见上架套餐', async () => {
    const prisma = planPrisma([
      { id: 'p1', tenantId: 't1', name: 'on', resource: 'AI', quantity: 1, priceCents: 1, isUnit: false, active: true, createdAt: new Date() },
      { id: 'p2', tenantId: 't1', name: 'off', resource: 'AI', quantity: 1, priceCents: 1, isUnit: false, active: false, createdAt: new Date() },
    ]);
    const svc = new BillingService(prisma);
    const list = await svc.listPlans(merchant);
    expect(list.map((p) => p.name)).toEqual(['on']);
  });

  it('removePlan:有订单引用则改下架而非删除', async () => {
    const prisma = planPrisma([{ id: 'p1', tenantId: 't1', name: 'x', resource: 'AI', quantity: 1, priceCents: 1, isUnit: false, active: true, createdAt: new Date() }]);
    prisma.creditOrder.count = async () => 2;
    const svc = new BillingService(prisma);
    const out = await svc.removePlan(sysadmin, 'p1');
    expect(out).toEqual({ id: 'p1', archived: true });
  });
});

describe('BillingService.createOrder', () => {
  function orderPrisma(plans: any[]) {
    let created: any = null;
    const prisma: any = {
      creditPlan: {
        findFirst: async (a: any) => plans.find((p) => {
          if (a.where.id) return p.id === a.where.id && (a.where.active === undefined || p.active === a.where.active);
          // 自定义计价:按 resource + isUnit 查单价基准
          return p.resource === a.where.resource && p.isUnit === a.where.isUnit && p.active === a.where.active;
        }) ?? null,
      },
      creditOrder: { create: async (a: any) => { created = { id: 'o1', createdAt: new Date(), paidAt: null, ...a.data }; return created; } },
    };
    return { prisma, get created() { return created; } };
  }

  it('选固定套餐:采纳套餐数量与价格,落 PENDING', async () => {
    const { prisma } = orderPrisma([{ id: 'p1', tenantId: 't1', name: 'AI100', resource: 'AI', quantity: 100, priceCents: 1000, isUnit: false, active: true }]);
    const svc = new BillingService(prisma);
    const o = await svc.createOrder(merchant, { planId: 'p1' });
    expect(o).toMatchObject({ resource: 'AI', quantity: 100, amountCents: 1000, status: 'PENDING', planName: 'AI100', ownerType: 'MERCHANT', ownerId: 'm1' });
  });

  it('自定义数量:按单价基准向上取整计价', async () => {
    // 单价基准 priceCents=12 / quantity=1 → 每个 0.12 元;买 250 个 = 3000 分
    const { prisma } = orderPrisma([{ id: 'u1', tenantId: 't1', name: 'AI单价', resource: 'AI', quantity: 1, priceCents: 12, isUnit: true, active: true }]);
    const svc = new BillingService(prisma);
    const o = await svc.createOrder(merchant, { resource: 'AI', quantity: 250 });
    expect(o).toMatchObject({ resource: 'AI', quantity: 250, amountCents: 3000, status: 'PENDING' });
  });

  it('自定义但无单价基准:抛 BadRequest', async () => {
    const { prisma } = orderPrisma([]);
    const svc = new BillingService(prisma);
    await expect(svc.createOrder(merchant, { resource: 'CODE', quantity: 100 })).rejects.toThrow();
  });

  it('SYSTEM_ADMIN 不可自助购买', async () => {
    const { prisma } = orderPrisma([{ id: 'p1', tenantId: 't1', name: 'x', resource: 'AI', quantity: 1, priceCents: 1, isUnit: false, active: true }]);
    const svc = new BillingService(prisma);
    await expect(svc.createOrder(sysadmin, { planId: 'p1' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('BillingService.payOrder', () => {
  function payPrisma(order: any, startBalance = 0) {
    const state: any = { aiBalance: startBalance, codeBalance: startBalance };
    const orderRow = { ...order };
    const ledgers: any[] = [];
    const tx: any = {
      creditOrder: {
        updateMany: async (a: any) => {
          if (orderRow.status === a.where.status) { Object.assign(orderRow, a.data); return { count: 1 }; }
          return { count: 0 };
        },
        findUnique: async () => ({ ...orderRow }),
      },
      creditAccount: {
        updateMany: async (a: any) => { const f = a.data.aiBalance ? 'aiBalance' : 'codeBalance'; state[f] += (a.data.aiBalance ?? a.data.codeBalance).increment; return { count: 1 }; },
        findUnique: async () => ({ id: 'acc1', ...state }),
      },
      creditLedger: { create: async (a: any) => { ledgers.push(a.data); return a.data; } },
    };
    const prisma: any = {
      creditOrder: { findFirst: async () => ({ ...orderRow }) },
      creditAccount: { findFirst: async () => ({ id: 'acc1', ownerType: orderRow.ownerType, ownerId: orderRow.ownerId, tenantId: 't1', ...state }), create: async () => ({ id: 'acc1', ...state }) },
      creditPlan: { findUnique: async () => null },
      $transaction: async (fn: any) => fn(tx),
    };
    return { prisma, state, ledgers, orderRow };
  }

  const baseOrder = { id: 'o1', tenantId: 't1', ownerType: 'MERCHANT', ownerId: 'm1', planId: null, resource: 'CODE', quantity: 1000, amountCents: 2000, status: 'PENDING', buyerId: 'u3', createdAt: new Date() };

  it('支付 PENDING 订单:余额到账 + 写 PURCHASE 流水 + 订单转 PAID', async () => {
    const { prisma, state, ledgers } = payPrisma(baseOrder, 500);
    const svc = new BillingService(prisma);
    const out = await svc.payOrder(merchant, 'o1');
    expect(state.codeBalance).toBe(1500);
    expect(ledgers[0]).toMatchObject({ resource: 'CODE', delta: 1000, balanceAfter: 1500, reason: 'PURCHASE', refType: 'order', refId: 'o1' });
    expect(out.status).toBe('PAID');
  });

  it('幂等:已 PAID 订单重复支付不二次入账', async () => {
    const { prisma, state, ledgers } = payPrisma({ ...baseOrder, status: 'PAID' }, 500);
    const svc = new BillingService(prisma);
    await svc.payOrder(merchant, 'o1');
    expect(state.codeBalance).toBe(500);
    expect(ledgers).toHaveLength(0);
  });

  it('越权:不可支付他人账户的订单', async () => {
    const { prisma } = payPrisma({ ...baseOrder, ownerId: 'mX' }, 0);
    const svc = new BillingService(prisma);
    await expect(svc.payOrder(merchant, 'o1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('BillingService.cancelOrder', () => {
  const baseOrder = { id: 'o1', tenantId: 't1', ownerType: 'MERCHANT', ownerId: 'm1', planId: null, resource: 'CODE', quantity: 1000, amountCents: 2000, status: 'PENDING', buyerId: 'u3', createdAt: new Date(), paidAt: null };

  function cancelPrisma(order: any) {
    const orderRow = { ...order };
    const prisma: any = {
      creditOrder: {
        findFirst: async () => ({ ...orderRow }),
        updateMany: async (a: any) => { if (orderRow.status === a.where.status) { Object.assign(orderRow, a.data); return { count: 1 }; } return { count: 0 }; },
        findUnique: async () => ({ ...orderRow, plan: null }),
      },
    };
    return { prisma, orderRow };
  }

  it('取消本人 PENDING 订单:转 CANCELLED', async () => {
    const { prisma } = cancelPrisma(baseOrder);
    const out = await new BillingService(prisma).cancelOrder(merchant, 'o1');
    expect(out.status).toBe('CANCELLED');
  });

  it('已支付订单不可取消', async () => {
    const { prisma } = cancelPrisma({ ...baseOrder, status: 'PAID' });
    await expect(new BillingService(prisma).cancelOrder(merchant, 'o1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('越权:不可取消他人订单', async () => {
    const { prisma } = cancelPrisma({ ...baseOrder, ownerId: 'mX' });
    await expect(new BillingService(prisma).cancelOrder(merchant, 'o1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
