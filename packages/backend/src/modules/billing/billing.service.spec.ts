import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { Role, type AuthUser } from '@nongchang/shared';

const sysadmin: AuthUser = { userId: 'u1', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const agent: AuthUser = { userId: 'u2', tenantId: 't1', role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null };
const merchant: AuthUser = { userId: 'u3', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };

function makeService(opts: { aiBalance?: number; codeBalance?: number; account?: any; now?: Date } = {}) {
  const state: any = { aiBalance: opts.aiBalance ?? 0, codeBalance: opts.codeBalance ?? 0 };
  const ledgers: any[] = [];
  const reservations: any[] = [];
  const traceCodes: any[] = [];
  const accountRow = opts.account ?? { id: 'acc1', ownerType: 'MERCHANT', ownerId: 'm1', tenantId: 't1' };
  const now = opts.now ?? new Date('2026-07-06T00:00:00.000Z');
  const tx = {
    creditAccount: {
      upsert: async () => ({ ...accountRow, ...state }),
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
    creditLedger: {
      findFirst: async (a: any) => ledgers.find((l) =>
        l.accountId === a.where.accountId &&
        (Array.isArray(a.where.reason?.in) ? a.where.reason.in.includes(l.reason) : l.reason === a.where.reason) &&
        l.idempotencyKey === a.where.idempotencyKey,
      ) ?? null,
      create: async (a: any) => { ledgers.push(a.data); return a.data; },
    },
    creditReservation: {
      findMany: async (a: any) => reservations
        .filter((r) => {
          if (a.where?.status && r.status !== a.where.status) return false;
          if (a.where?.resource && r.resource !== a.where.resource) return false;
          if (a.where?.refType && r.refType !== a.where.refType) return false;
          if (a.where?.createdAt?.lt && !(new Date(r.createdAt) < a.where.createdAt.lt)) return false;
          return true;
        })
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
        .slice(0, a.take ?? reservations.length)
        .map((r) => ({
          ...r,
          account: { ownerType: accountRow.ownerType, ownerId: accountRow.ownerId },
        })),
      findFirst: async (a: any) => reservations.find((r) =>
        r.accountId === a.where.accountId &&
        r.resource === a.where.resource &&
        r.idempotencyKey === a.where.idempotencyKey,
      ) ?? null,
      findUnique: async (a: any) => {
        const row = reservations.find((r) => r.id === a.where.id);
        return row ? { ...row, account: { ownerType: accountRow.ownerType, ownerId: accountRow.ownerId } } : null;
      },
      create: async (a: any) => {
        const row = { id: `res${reservations.length + 1}`, createdAt: now, updatedAt: now, ...a.data };
        reservations.push(row);
        return row;
      },
      updateMany: async (a: any) => {
        const row = reservations.find((r) => r.id === a.where.id && (!a.where.status || r.status === a.where.status));
        if (!row) return { count: 0 };
        Object.assign(row, a.data);
        return { count: 1 };
      },
    },
    traceCode: {
      count: async (a: any) => traceCodes.filter((row) => {
        if (a.where?.reservationId && row.reservationId !== a.where.reservationId) return false;
        if (a.where?.tenantId && row.tenantId !== a.where.tenantId) return false;
        if (a.where?.batchId && row.batchId !== a.where.batchId) return false;
        if (a.where?.generationKey && row.generationKey !== a.where.generationKey) return false;
        return true;
      }).length,
    },
  };
  const prisma: any = {
    ...tx,
    $transaction: async (fn: any) => fn(tx),
  };
  const svc = new BillingService(prisma);
  return { svc, state, ledgers, reservations, traceCodes, prisma };
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

  it('同一幂等键重复消费时不二次扣减', async () => {
    const { svc, state, ledgers } = makeService({ aiBalance: 10 });
    const ref = { refType: 'ai.chat', idempotencyKey: 'credit:t1:u3:ai.chat:1' } as any;

    await svc.consume(merchant, 'AI', 3, ref);
    await svc.consume(merchant, 'AI', 3, ref);

    expect(state.aiBalance).toBe(7);
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]).toMatchObject({ reason: 'CONSUME', idempotencyKey: ref.idempotencyKey });
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

describe('BillingService reservation model', () => {
  it('reserve:余额充足时扣减并写 RESERVED 流水', async () => {
    const { svc, state, ledgers } = makeService({ codeBalance: 10 });
    const ref = { refType: 'trace.generate', refId: 'b1', idempotencyKey: 'trace.generate:t1:u3:b1:5' };

    await svc.reserve(merchant, 'CODE', 5, ref);

    expect(state.codeBalance).toBe(5);
    expect(ledgers[0]).toMatchObject({
      resource: 'CODE',
      delta: -5,
      balanceAfter: 5,
      reason: 'RESERVED',
      refType: 'trace.generate',
      refId: 'b1',
      idempotencyKey: ref.idempotencyKey,
    });
  });

  it('reserve:同一幂等键重复预约不二次扣减', async () => {
    const { svc, state, ledgers } = makeService({ codeBalance: 10 });
    const ref = { refType: 'trace.generate', idempotencyKey: 'trace.generate:t1:u3:b1:5' };

    await svc.reserve(merchant, 'CODE', 5, ref);
    await svc.reserve(merchant, 'CODE', 5, ref);

    expect(state.codeBalance).toBe(5);
    expect(ledgers.filter((l) => l.reason === 'RESERVED')).toHaveLength(1);
  });

  it('confirmReservation:已有 RESERVED 后写零 delta CONFIRMED 且幂等', async () => {
    const { svc, state, ledgers } = makeService({ codeBalance: 10 });
    const ref = { refType: 'trace.generate', idempotencyKey: 'trace.generate:t1:u3:b1:5' };

    await svc.reserve(merchant, 'CODE', 5, ref);
    await svc.confirmReservation(merchant, 'CODE', ref);
    await svc.confirmReservation(merchant, 'CODE', ref);

    expect(state.codeBalance).toBe(5);
    expect(ledgers.filter((l) => l.reason === 'CONFIRMED')).toHaveLength(1);
    expect(ledgers.find((l) => l.reason === 'CONFIRMED')).toMatchObject({ delta: 0, balanceAfter: 5 });
  });

  it('releaseReservation:已有 RESERVED 后退回额度并写 RELEASED 且幂等', async () => {
    const { svc, state, ledgers } = makeService({ codeBalance: 10 });
    const ref = { refType: 'trace.generate', idempotencyKey: 'trace.generate:t1:u3:b1:5' };

    await svc.reserve(merchant, 'CODE', 5, ref);
    await svc.releaseReservation(merchant, 'CODE', 5, ref);
    await svc.releaseReservation(merchant, 'CODE', 5, ref);

    expect(state.codeBalance).toBe(10);
    expect(ledgers.filter((l) => l.reason === 'RELEASED')).toHaveLength(1);
    expect(ledgers.find((l) => l.reason === 'RELEASED')).toMatchObject({ delta: 5, balanceAfter: 10 });
  });

  it('releaseReservation:没有 RESERVED 时拒绝释放,避免凭空加余额', async () => {
    const { svc, state, ledgers } = makeService({ codeBalance: 10 });

    await expect(
      svc.releaseReservation(merchant, 'CODE', 5, { idempotencyKey: 'missing' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(state.codeBalance).toBe(10);
    expect(ledgers).toHaveLength(0);
  });

  it('releaseReservation:已确认预约不可释放', async () => {
    const { svc, state } = makeService({ codeBalance: 10 });
    const ref = { refType: 'trace.generate', idempotencyKey: 'trace.generate:t1:u3:b1:5' };

    await svc.reserve(merchant, 'CODE', 5, ref);
    await svc.confirmReservation(merchant, 'CODE', ref);

    await expect(svc.releaseReservation(merchant, 'CODE', 5, ref)).rejects.toBeInstanceOf(BadRequestException);
    expect(state.codeBalance).toBe(5);
  });

  it('confirmReservation:已释放预约不可确认', async () => {
    const { svc, state } = makeService({ codeBalance: 10 });
    const ref = { refType: 'trace.generate', idempotencyKey: 'trace.generate:t1:u3:b1:5' };

    await svc.reserve(merchant, 'CODE', 5, ref);
    await svc.releaseReservation(merchant, 'CODE', 5, ref);

    await expect(svc.confirmReservation(merchant, 'CODE', ref)).rejects.toBeInstanceOf(BadRequestException);
    expect(state.codeBalance).toBe(10);
  });

  it('confirmReservation:CAS 失败时不写 CONFIRMED 流水', async () => {
    const { svc, ledgers, prisma } = makeService({ codeBalance: 10 });
    const ref = { refType: 'trace.generate', idempotencyKey: 'trace.generate:t1:u3:b1:5' };

    await svc.reserve(merchant, 'CODE', 5, ref);
    prisma.creditReservation.updateMany = async () => ({ count: 0 });

    await expect(svc.confirmReservation(merchant, 'CODE', ref)).rejects.toBeInstanceOf(BadRequestException);
    expect(ledgers.filter((l) => l.reason === 'CONFIRMED')).toHaveLength(0);
  });

  it('releaseReservation:CAS 失败时不返还余额也不写 RELEASED 流水', async () => {
    const { svc, state, ledgers, prisma } = makeService({ codeBalance: 10 });
    const ref = { refType: 'trace.generate', idempotencyKey: 'trace.generate:t1:u3:b1:5' };

    await svc.reserve(merchant, 'CODE', 5, ref);
    prisma.creditReservation.updateMany = async () => ({ count: 0 });

    await expect(svc.releaseReservation(merchant, 'CODE', 5, ref)).rejects.toBeInstanceOf(BadRequestException);
    expect(state.codeBalance).toBe(5);
    expect(ledgers.filter((l) => l.reason === 'RELEASED')).toHaveLength(0);
  });
  it('reserve rejects same idempotency key with a different amount', async () => {
    const { svc, state, ledgers } = makeService({ codeBalance: 10 });
    const ref = { refType: 'trace.generate', idempotencyKey: 'trace.generate:t1:u3:b1:req-1' };

    await svc.reserve(merchant, 'CODE', 2, ref);

    await expect(svc.reserve(merchant, 'CODE', 5, ref)).rejects.toBeInstanceOf(BadRequestException);
    expect(state.codeBalance).toBe(8);
    expect(ledgers.filter((l) => l.reason === 'RESERVED')).toHaveLength(1);
  });

  it('confirmReservation returns idempotently when CAS loses to an existing CONFIRMED ledger', async () => {
    const { svc, state, ledgers, prisma } = makeService({ codeBalance: 10 });
    const ref = { refType: 'trace.generate', idempotencyKey: 'trace.generate:t1:u3:b1:5' };

    await svc.reserve(merchant, 'CODE', 5, ref);
    prisma.creditReservation.updateMany = async () => {
      ledgers.push({
        accountId: 'acc1',
        resource: 'CODE',
        delta: 0,
        balanceAfter: 5,
        reason: 'CONFIRMED',
        idempotencyKey: ref.idempotencyKey,
      });
      return { count: 0 };
    };

    const out = await svc.confirmReservation(merchant, 'CODE', ref);

    expect(out).toMatchObject({ reservationId: 'res1', balanceAfter: 5 });
    expect(state.codeBalance).toBe(5);
    expect(ledgers.filter((l) => l.reason === 'CONFIRMED')).toHaveLength(1);
  });

  it('listStaleReservations returns only old RESERVED rows', async () => {
    const { svc, reservations } = makeService({ codeBalance: 10 });
    reservations.push(
      {
        id: 'old-reserved',
        tenantId: 't1',
        accountId: 'acc1',
        resource: 'CODE',
        amount: 5,
        balanceAfter: 5,
        status: 'RESERVED',
        refType: 'trace.generate',
        refId: 'b1',
        idempotencyKey: 'trace:old',
        operatorId: 'u3',
        note: null,
        createdAt: new Date('2026-07-06T00:00:00.000Z'),
        updatedAt: new Date('2026-07-06T00:00:00.000Z'),
      },
      {
        id: 'fresh-reserved',
        tenantId: 't1',
        accountId: 'acc1',
        resource: 'CODE',
        amount: 2,
        balanceAfter: 8,
        status: 'RESERVED',
        refType: 'trace.generate',
        refId: 'b2',
        idempotencyKey: 'trace:fresh',
        operatorId: 'u3',
        note: null,
        createdAt: new Date('2026-07-06T00:55:00.000Z'),
        updatedAt: new Date('2026-07-06T00:55:00.000Z'),
      },
    );

    const rows = await svc.listStaleReservations({
      olderThanMinutes: 30,
      now: new Date('2026-07-06T01:00:00.000Z'),
    });

    expect(rows.map((row) => row.id)).toEqual(['old-reserved']);
    expect(rows[0]).toMatchObject({
      resource: 'CODE',
      amount: 5,
      refType: 'trace.generate',
      ownerType: 'MERCHANT',
      ownerId: 'm1',
    });
  });

  it('releaseStaleReservations dry-run reports candidates without changing balance', async () => {
    const { svc, state, ledgers } = makeService({ codeBalance: 10 });
    await svc.reserve(merchant, 'CODE', 5, { refType: 'trace.generate', idempotencyKey: 'trace:dry' });

    const out = await svc.releaseStaleReservations({
      olderThanMinutes: 30,
      now: new Date('2026-07-06T01:00:00.000Z'),
      dryRun: true,
    });

    expect(out).toMatchObject({ scanned: 1, released: 0, skipped: 1, errors: [] });
    expect(state.codeBalance).toBe(5);
    expect(ledgers.filter((ledger) => ledger.reason === 'RELEASED')).toHaveLength(0);
  });

  it('releaseStaleReservations releases stale RESERVED rows once', async () => {
    const { svc, state, ledgers, reservations } = makeService({ codeBalance: 10 });
    await svc.reserve(merchant, 'CODE', 5, { refType: 'trace.generate', idempotencyKey: 'trace:release' });

    const out = await svc.releaseStaleReservations({
      olderThanMinutes: 30,
      now: new Date('2026-07-06T01:00:00.000Z'),
    });

    expect(out).toMatchObject({ scanned: 1, released: 1, skipped: 0, errors: [] });
    expect(state.codeBalance).toBe(10);
    expect(reservations[0].status).toBe('RELEASED');
    expect(ledgers.find((ledger) => ledger.reason === 'RELEASED')).toMatchObject({
      resource: 'CODE',
      delta: 5,
      idempotencyKey: 'trace:release',
      operatorId: 'system:reservation-recovery',
    });
  });

  it('releaseStaleReservations confirms trace reservations that already produced codes', async () => {
    const { svc, state, ledgers, reservations, traceCodes } = makeService({ codeBalance: 10 });
    await svc.reserve(merchant, 'CODE', 5, {
      refType: 'trace.generate',
      refId: 'b1',
      idempotencyKey: 'trace.generate:t1:u3:b1:req-confirm-existing-codes',
    });
    traceCodes.push(
      { id: 'code1', tenantId: 't1', batchId: 'b1', reservationId: 'res1', generationKey: 'trace.generate:t1:u3:b1:req-confirm-existing-codes' },
      { id: 'code2', tenantId: 't1', batchId: 'b1', reservationId: 'res1', generationKey: 'trace.generate:t1:u3:b1:req-confirm-existing-codes' },
    );

    const out = await svc.releaseStaleReservations({
      olderThanMinutes: 30,
      now: new Date('2026-07-06T01:00:00.000Z'),
    });

    expect(out).toMatchObject({ scanned: 1, released: 0, skipped: 1, errors: [] });
    expect(state.codeBalance).toBe(5);
    expect(reservations[0].status).toBe('CONFIRMED');
    expect(ledgers.find((ledger) => ledger.reason === 'CONFIRMED')).toMatchObject({
      resource: 'CODE',
      delta: 0,
      idempotencyKey: 'trace.generate:t1:u3:b1:req-confirm-existing-codes',
      operatorId: 'system:reservation-recovery',
    });
    expect(ledgers.filter((ledger) => ledger.reason === 'RELEASED')).toHaveLength(0);
  });

  it('releaseStaleReservations does not confirm trace reservations from unrelated codes', async () => {
    const { svc, state, ledgers, reservations, traceCodes } = makeService({ codeBalance: 10 });
    await svc.reserve(merchant, 'CODE', 5, {
      refType: 'trace.generate',
      refId: 'b1',
      idempotencyKey: 'trace.generate:t1:u3:b1:req-unrelated-codes',
    });
    traceCodes.push({
      id: 'code-other',
      tenantId: 't1',
      batchId: 'b1',
      reservationId: 'other-reservation',
      generationKey: 'trace.generate:t1:u3:b1:req-unrelated-codes',
    });

    const out = await svc.releaseStaleReservations({
      olderThanMinutes: 30,
      now: new Date('2026-07-06T01:00:00.000Z'),
    });

    expect(out).toMatchObject({ scanned: 1, released: 1, skipped: 0, errors: [] });
    expect(state.codeBalance).toBe(10);
    expect(reservations[0].status).toBe('RELEASED');
    expect(ledgers.find((ledger) => ledger.reason === 'RELEASED')).toMatchObject({
      resource: 'CODE',
      delta: 5,
      idempotencyKey: 'trace.generate:t1:u3:b1:req-unrelated-codes',
      operatorId: 'system:reservation-recovery',
    });
    expect(ledgers.filter((ledger) => ledger.reason === 'CONFIRMED')).toHaveLength(0);
  });

  it('releaseStaleReservations skips rows no longer RESERVED', async () => {
    const { svc, state, prisma } = makeService({ codeBalance: 10 });
    await svc.reserve(merchant, 'CODE', 5, { refType: 'trace.generate', idempotencyKey: 'trace:race' });
    prisma.creditReservation.updateMany = async () => ({ count: 0 });

    const out = await svc.releaseStaleReservations({
      olderThanMinutes: 30,
      now: new Date('2026-07-06T01:00:00.000Z'),
    });

    expect(out).toMatchObject({ scanned: 1, released: 0, skipped: 1, errors: [] });
    expect(state.codeBalance).toBe(5);
  });

  it('releaseStaleReservations ignores stale terminal reservations', async () => {
    const { svc, state, ledgers, reservations } = makeService({ codeBalance: 10 });
    reservations.push(
      {
        id: 'old-confirmed',
        tenantId: 't1',
        accountId: 'acc1',
        resource: 'CODE',
        amount: 5,
        balanceAfter: 5,
        status: 'CONFIRMED',
        refType: 'trace.generate',
        refId: 'b1',
        idempotencyKey: 'trace:confirmed',
        operatorId: 'u3',
        note: null,
        createdAt: new Date('2026-07-06T00:00:00.000Z'),
        updatedAt: new Date('2026-07-06T00:10:00.000Z'),
      },
      {
        id: 'old-reserved',
        tenantId: 't1',
        accountId: 'acc1',
        resource: 'CODE',
        amount: 2,
        balanceAfter: 3,
        status: 'RESERVED',
        refType: 'trace.generate',
        refId: 'b2',
        idempotencyKey: 'trace:reserved',
        operatorId: 'u3',
        note: null,
        createdAt: new Date('2026-07-06T00:05:00.000Z'),
        updatedAt: new Date('2026-07-06T00:05:00.000Z'),
      },
    );

    const out = await svc.releaseStaleReservations({
      olderThanMinutes: 30,
      now: new Date('2026-07-06T01:00:00.000Z'),
    });

    expect(out).toMatchObject({ scanned: 1, released: 1, skipped: 0, errors: [] });
    expect(reservations.find((row) => row.id === 'old-confirmed')?.status).toBe('CONFIRMED');
    expect(reservations.find((row) => row.id === 'old-reserved')?.status).toBe('RELEASED');
    expect(state.codeBalance).toBe(12);
    expect(ledgers.filter((ledger) => ledger.reason === 'RELEASED')).toHaveLength(1);
  });

  it('releaseStaleReservations errors without balance mutation when RELEASED ledger already exists', async () => {
    const { svc, state, ledgers } = makeService({ codeBalance: 10 });
    await svc.reserve(merchant, 'CODE', 5, { refType: 'trace.generate', idempotencyKey: 'trace:dirty' });
    ledgers.push({
      accountId: 'acc1',
      resource: 'CODE',
      delta: 5,
      balanceAfter: 10,
      reason: 'RELEASED',
      idempotencyKey: 'trace:dirty',
    });

    const out = await svc.releaseStaleReservations({
      olderThanMinutes: 30,
      now: new Date('2026-07-06T01:00:00.000Z'),
    });

    expect(out.scanned).toBe(1);
    expect(out.released).toBe(0);
    expect(out.errors[0]).toMatchObject({ reservationId: 'res1' });
    expect(state.codeBalance).toBe(5);
    expect(ledgers.filter((ledger) => ledger.reason === 'RELEASED')).toHaveLength(1);
  });

  it('releaseStaleReservations errors without balance mutation when CONFIRMED ledger already exists', async () => {
    const { svc, state, ledgers, reservations } = makeService({ codeBalance: 10 });
    await svc.reserve(merchant, 'CODE', 5, { refType: 'trace.generate', idempotencyKey: 'trace:confirmed-dirty' });
    ledgers.push({
      accountId: 'acc1',
      resource: 'CODE',
      delta: 0,
      balanceAfter: 5,
      reason: 'CONFIRMED',
      idempotencyKey: 'trace:confirmed-dirty',
    });

    const out = await svc.releaseStaleReservations({
      olderThanMinutes: 30,
      now: new Date('2026-07-06T01:00:00.000Z'),
    });

    expect(out.scanned).toBe(1);
    expect(out.released).toBe(0);
    expect(out.errors[0]).toMatchObject({ reservationId: 'res1' });
    expect(reservations[0].status).toBe('RESERVED');
    expect(state.codeBalance).toBe(5);
    expect(ledgers.filter((ledger) => ledger.reason === 'RELEASED')).toHaveLength(0);
  });

  it('releaseStaleReservations validates take bounds in the service layer', async () => {
    const { svc } = makeService({ codeBalance: 10 });
    await expect(svc.listStaleReservations({ take: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.listStaleReservations({ take: 1001 })).rejects.toBeInstanceOf(BadRequestException);
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
        upsert: async (a: any) => {
          if (a.where.tenantId_ownerType_ownerId.ownerType === 'PLATFORM') {
            return { id: 'accP', ownerType: 'PLATFORM', ownerId: 'PLATFORM', tenantId: 't1', ...fromState };
          }
          return { id: 'accA', ownerType: 'AGENT', ownerId: 'a1', tenantId: 't1', ...toState };
        },
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
        upsert: async () => ({ id: 'acc1', ownerType: 'MERCHANT', ownerId: 'm1', aiBalance: 5, codeBalance: 8 }),
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

  it('并发首次读取同一账户时不应因重复建账失败', async () => {
    const account = { id: 'acc1', ownerType: 'MERCHANT', ownerId: 'm1', tenantId: 't1', aiBalance: 0, codeBalance: 0 };
    const prisma: any = {
      creditAccount: {
        findFirst: async () => null,
        findUnique: async () => account,
        create: async () => { throw new Error('create should not be used'); },
        upsert: vi.fn().mockResolvedValue(account),
      },
    };
    const svc = new BillingService(prisma);
    const [a, b] = await Promise.all([svc.summary(merchant), svc.summary(merchant)]);
    expect(a).toEqual({ ownerType: 'MERCHANT', ownerId: 'm1', aiBalance: 0, codeBalance: 0 });
    expect(b).toEqual({ ownerType: 'MERCHANT', ownerId: 'm1', aiBalance: 0, codeBalance: 0 });
  });
});

describe('BillingService.listAccounts (N+1 修复)', () => {
  it('SYSTEM_ADMIN:一次 findMany 取所有代理商余额,不逐个建账', async () => {
    let findManyCalls = 0;
    let created = 0;
    const prisma: any = {
      agent: { findMany: async () => [{ id: 'a1', name: '代理一' }, { id: 'a2', name: '代理二' }] },
      creditAccount: {
        findMany: async (q: any) => {
          findManyCalls++;
          expect(q.where.ownerType).toBe('AGENT');
          expect(q.where.ownerId.in).toEqual(['a1', 'a2']);
          // a1 已有账户,a2 从未触账(不在结果里)
          return [{ id: 'accA1', ownerId: 'a1', aiBalance: 30, codeBalance: 40 }];
        },
        findFirst: async () => { throw new Error('不应调用 findFirst(N+1)'); },
        create: async () => { created++; return {}; },
      },
    };
    const svc = new BillingService(prisma);
    const out = await svc.listAccounts(sysadmin);
    expect(findManyCalls).toBe(1); // 单次批量查询
    expect(created).toBe(0);       // 列表不再副作用建账
    expect(out).toEqual([
      { id: 'accA1', ownerType: 'AGENT', ownerId: 'a1', ownerName: '代理一', aiBalance: 30, codeBalance: 40 },
      { id: 'pending:AGENT:a2', ownerType: 'AGENT', ownerId: 'a2', ownerName: '代理二', aiBalance: 0, codeBalance: 0 },
    ]);
  });

  it('AGENT_ADMIN:返回旗下商户余额,未触账商户按 0/0 且 id 唯一', async () => {
    const prisma: any = {
      user: { findMany: async () => [{ id: 'm1', displayName: '商户一' }, { id: 'm2', displayName: '商户二' }] },
      creditAccount: {
        findMany: async () => [{ id: 'accM2', ownerId: 'm2', aiBalance: 5, codeBalance: 0 }],
      },
    };
    const svc = new BillingService(prisma);
    const out = await svc.listAccounts(agent);
    expect(out).toEqual([
      { id: 'pending:MERCHANT:m1', ownerType: 'MERCHANT', ownerId: 'm1', ownerName: '商户一', aiBalance: 0, codeBalance: 0 },
      { id: 'accM2', ownerType: 'MERCHANT', ownerId: 'm2', ownerName: '商户二', aiBalance: 5, codeBalance: 0 },
    ]);
    // id 唯一(React key 不冲突)
    expect(new Set(out.map((o) => o.id)).size).toBe(out.length);
  });

  it('MERCHANT:无下级返回空数组', async () => {
    const svc = new BillingService({} as any);
    await expect(svc.listAccounts(merchant)).resolves.toEqual([]);
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
  beforeEach(() => { process.env.ALLOW_MANUAL_PAY = 'true'; });
  afterEach(() => { delete process.env.ALLOW_MANUAL_PAY; });
  function payPrisma(order: any, startBalance = 0) {
    const state: any = { aiBalance: startBalance, codeBalance: startBalance };
    const orderRow = { ...order };
    const ledgers: any[] = [];
    const tx: any = {
      creditOrder: {
        updateMany: async (a: any) => {
          // settleOrder 现用 status: { in: ['PENDING','CANCELLED'] };兼容字符串与 in 数组两种条件。
          const cond = a.where.status;
          const allowed = cond && typeof cond === 'object' && Array.isArray(cond.in) ? cond.in : [cond];
          if (allowed.includes(orderRow.status)) { Object.assign(orderRow, a.data); return { count: 1 }; }
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
      creditAccount: {
        upsert: async () => ({ id: 'acc1', ownerType: orderRow.ownerType, ownerId: orderRow.ownerId, tenantId: 't1', ...state }),
        findFirst: async () => ({ id: 'acc1', ownerType: orderRow.ownerType, ownerId: orderRow.ownerId, tenantId: 't1', ...state }),
        create: async () => ({ id: 'acc1', ...state }),
      },
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

  it('闸门关闭(ALLOW_MANUAL_PAY!=true):拒绝兜底入账', async () => {
    delete process.env.ALLOW_MANUAL_PAY;
    const { prisma, state, ledgers } = payPrisma(baseOrder, 500);
    const svc = new BillingService(prisma);
    await expect(svc.payOrder(merchant, 'o1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(state.codeBalance).toBe(500); // 未入账
    expect(ledgers).toHaveLength(0);
  });
});

describe('BillingService.settleOrder 回调赢得竞态', () => {
  // settleOrder 共用入账逻辑;复用 payOrder 的 mock 工厂(支持 PENDING/CANCELLED 入账)。
  function settlePrisma(order: any, startBalance = 0) {
    const state: any = { aiBalance: startBalance, codeBalance: startBalance };
    const orderRow = { ...order };
    const ledgers: any[] = [];
    const tx: any = {
      creditOrder: {
        updateMany: async (a: any) => {
          const cond = a.where.status;
          const allowed = cond && typeof cond === 'object' && Array.isArray(cond.in) ? cond.in : [cond];
          if (allowed.includes(orderRow.status)) { Object.assign(orderRow, a.data); return { count: 1 }; }
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
      creditAccount: {
        upsert: async () => ({ id: 'acc1', ownerType: orderRow.ownerType, ownerId: orderRow.ownerId, tenantId: 't1', ...state }),
        findFirst: async () => ({ id: 'acc1', ownerType: orderRow.ownerType, ownerId: orderRow.ownerId, tenantId: 't1', ...state }),
        create: async () => ({ id: 'acc1', ...state }),
      },
      $transaction: async (fn: any) => fn(tx),
    };
    return { prisma, state, ledgers, orderRow };
  }

  const baseOrder = { id: 'o1', tenantId: 't1', ownerType: 'MERCHANT', ownerId: 'm1', resource: 'CODE', quantity: 1000, status: 'PENDING' };

  it('PENDING 订单回调:入账 + 转 PAID + 写 PURCHASE 流水', async () => {
    const { prisma, state, ledgers, orderRow } = settlePrisma(baseOrder, 500);
    await new BillingService(prisma).settleOrder(baseOrder, { payChannel: 'alipay', tradeNo: 'T1' });
    expect(state.codeBalance).toBe(1500);
    expect(orderRow.status).toBe('PAID');
    expect(ledgers[0]).toMatchObject({ reason: 'PURCHASE', delta: 1000, refId: 'o1' });
  });

  it('已取消订单回调:支付宝付款凭证补入账,转 PAID(回调赢得竞态,不丢钱)', async () => {
    const { prisma, state, ledgers, orderRow } = settlePrisma({ ...baseOrder, status: 'CANCELLED' }, 500);
    await new BillingService(prisma).settleOrder(baseOrder, { payChannel: 'alipay', tradeNo: 'T1' });
    expect(state.codeBalance).toBe(1500); // 已取消订单仍入账
    expect(orderRow.status).toBe('PAID');
    expect(ledgers).toHaveLength(1);
  });

  it('已 PAID 订单回调:幂等,不二次入账', async () => {
    const { prisma, state, ledgers } = settlePrisma({ ...baseOrder, status: 'PAID' }, 500);
    await new BillingService(prisma).settleOrder(baseOrder, { payChannel: 'alipay', tradeNo: 'T1' });
    expect(state.codeBalance).toBe(500);
    expect(ledgers).toHaveLength(0);
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
