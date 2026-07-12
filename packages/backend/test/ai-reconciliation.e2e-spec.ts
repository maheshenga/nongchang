import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser } from '@nongchang/shared';
import { PrismaService } from '../src/prisma/prisma.service';
import { BillingService } from '../src/modules/billing/billing.service';
import { AiBillingCoordinator } from '../src/modules/billing/ai-billing-coordinator';

describe('AI billing reconciliation e2e', () => {
  const prisma = new PrismaService();
  const billing = new BillingService(prisma);
  const coordinator = new AiBillingCoordinator(prisma, billing);
  const operationPrefix = `ai-reconcile-${randomUUID()}`;
  let user: AuthUser;
  let accountId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: 'DEMO' } });
    const createdUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        username: `ai_reconcile_${randomUUID().slice(0, 8)}`,
        passwordHash: await bcrypt.hash(randomUUID(), 4),
        role: 'merchant',
        displayName: 'AI reconciliation E2E',
        status: 'active',
      },
    });
    const account = await prisma.creditAccount.create({
      data: {
        tenantId: tenant.id,
        ownerType: 'MERCHANT',
        ownerId: createdUser.id,
        aiBalance: 100,
        codeBalance: 0,
      },
    });
    accountId = account.id;
    user = {
      userId: createdUser.id,
      tenantId: tenant.id,
      role: 'merchant',
      agentId: null,
      ownerId: createdUser.id,
      sessionVersion: 0,
    };
  });

  afterAll(async () => {
    await prisma.aiOperation.deleteMany({ where: { operationKey: { startsWith: operationPrefix } } });
    await prisma.creditLedger.deleteMany({ where: { accountId } });
    await prisma.creditReservation.deleteMany({ where: { accountId } });
    await prisma.creditAccount.deleteMany({ where: { id: accountId } });
    await prisma.user.deleteMany({ where: { id: user.userId } });
    await prisma.$disconnect();
  });

  it('releases safe states, confirms success, and quarantines ambiguous in-flight calls', async () => {
    const old = new Date('2026-01-01T00:00:00.000Z');
    const cases = [
      { suffix: 'reserved', amount: 2, status: 'RESERVED' as const },
      { suffix: 'succeeded', amount: 3, status: 'SUCCEEDED' as const },
      { suffix: 'in-flight', amount: 4, status: 'IN_FLIGHT' as const },
    ];

    for (const item of cases) {
      const operationKey = `${operationPrefix}:${item.suffix}`;
      const ref = { refType: 'ai.chat', idempotencyKey: operationKey };
      const reservation = await billing.reserve(user, 'AI', item.amount, ref);
      await prisma.aiOperation.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          providerId: 'provider:e2e',
          kind: 'ai.chat',
          operationKey,
          reservationId: reservation.reservationId,
          status: item.status,
          createdAt: old,
        },
      });
    }

    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { id: accountId } })).aiBalance).toBe(91);

    const result = await coordinator.reconcileStale({
      cutoff: new Date('2026-02-01T00:00:00.000Z'),
      take: 20,
    });

    expect(result).toMatchObject({
      scanned: 3,
      released: 1,
      confirmed: 1,
      reviewRequired: 1,
      skipped: 0,
      errors: [],
    });
    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { id: accountId } })).aiBalance).toBe(93);

    const operations = await prisma.aiOperation.findMany({
      where: { operationKey: { startsWith: operationPrefix } },
      orderBy: { operationKey: 'asc' },
      select: { operationKey: true, status: true },
    });
    expect(Object.fromEntries(operations.map((operation) => [operation.operationKey, operation.status]))).toEqual({
      [`${operationPrefix}:in-flight`]: 'REVIEW_REQUIRED',
      [`${operationPrefix}:reserved`]: 'RELEASED',
      [`${operationPrefix}:succeeded`]: 'CONFIRMED',
    });

    const terminalLedgers = await prisma.creditLedger.findMany({
      where: { accountId, reason: { in: ['CONFIRMED', 'RELEASED'] } },
      select: { reason: true, idempotencyKey: true },
    });
    expect(terminalLedgers).toEqual(expect.arrayContaining([
      { reason: 'RELEASED', idempotencyKey: `${operationPrefix}:reserved` },
      { reason: 'CONFIRMED', idempotencyKey: `${operationPrefix}:succeeded` },
    ]));
    expect(terminalLedgers.some((ledger) => ledger.idempotencyKey === `${operationPrefix}:in-flight`)).toBe(false);
  });
});
