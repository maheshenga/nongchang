import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
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
