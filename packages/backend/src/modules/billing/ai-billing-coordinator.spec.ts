import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@nongchang/shared';
import { AiBillingCoordinator } from './ai-billing-coordinator';

const user = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  role: 'merchant',
  agentId: null,
  ownerId: 'user-1',
} as AuthUser;

const input = {
  user,
  providerId: 'provider-1',
  kind: 'ai.chat',
  operationKey: 'op-key',
  amount: 1,
  ref: { refType: 'ai.chat', idempotencyKey: 'op-key' },
};

function createHarness() {
  const updates: string[] = [];
  const prisma = {
    aiOperation: {
      create: vi.fn().mockResolvedValue({ id: 'operation-1' }),
      update: vi.fn().mockImplementation(async ({ data }: { data: { status: string } }) => {
        updates.push(data.status);
        return { id: 'operation-1', ...data };
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: user.userId,
        tenantId: user.tenantId,
        role: user.role,
        agentId: user.agentId,
        sessionVersion: 0,
      }),
    },
  };
  const billing = {
    reserve: vi.fn().mockResolvedValue({ reservationId: 'reservation-1', balanceAfter: 9 }),
    confirmReservation: vi.fn().mockResolvedValue({ reservationId: 'reservation-1', balanceAfter: 9 }),
    releaseReservation: vi.fn().mockResolvedValue({ reservationId: 'reservation-1', balanceAfter: 10 }),
  };
  return {
    prisma,
    billing,
    updates,
    coordinator: new AiBillingCoordinator(prisma as never, billing as never),
  };
}

describe('AiBillingCoordinator.execute', () => {
  it('persists RESERVED -> IN_FLIGHT -> SUCCEEDED -> CONFIRMED on success', async () => {
    const { coordinator, prisma, billing, updates } = createHarness();

    await expect(coordinator.execute(input, async () => 'answer')).resolves.toBe('answer');

    expect(billing.reserve).toHaveBeenCalledWith(user, 'AI', 1, input.ref);
    expect(prisma.aiOperation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: user.tenantId,
        userId: user.userId,
        providerId: 'provider-1',
        kind: 'ai.chat',
        operationKey: 'op-key',
        reservationId: 'reservation-1',
        status: 'RESERVED',
      }),
    });
    expect(updates).toEqual(['IN_FLIGHT', 'SUCCEEDED', 'CONFIRMED']);
    expect(billing.confirmReservation).toHaveBeenCalledWith(user, 'AI', input.ref);
    expect(billing.releaseReservation).not.toHaveBeenCalled();
  });

  it('persists FAILED, releases credit, then writes RELEASED after provider failure', async () => {
    const { coordinator, billing, updates } = createHarness();
    const providerError = new Error('Bearer secret-provider-key');

    await expect(coordinator.execute(input, async () => { throw providerError; })).rejects.toBe(providerError);

    expect(updates).toEqual(['IN_FLIGHT', 'FAILED', 'RELEASED']);
    expect(billing.releaseReservation).toHaveBeenCalledWith(user, 'AI', 1, input.ref);
    expect(billing.confirmReservation).not.toHaveBeenCalled();
  });

  it('leaves SUCCEEDED and does not release when confirmation fails', async () => {
    const { coordinator, billing, updates } = createHarness();
    billing.confirmReservation.mockRejectedValueOnce(new Error('confirm unavailable'));

    await expect(coordinator.execute(input, async () => 'answer')).rejects.toThrow('confirm unavailable');

    expect(updates).toEqual(['IN_FLIGHT', 'SUCCEEDED']);
    expect(billing.releaseReservation).not.toHaveBeenCalled();
  });

  it('leaves IN_FLIGHT and does not release if SUCCEEDED cannot be persisted', async () => {
    const { coordinator, prisma, billing, updates } = createHarness();
    prisma.aiOperation.update.mockImplementation(async ({ data }: { data: { status: string } }) => {
      if (data.status === 'SUCCEEDED') throw new Error('database unavailable');
      updates.push(data.status);
      return { id: 'operation-1', ...data };
    });

    await expect(coordinator.execute(input, async () => 'answer')).rejects.toThrow('database unavailable');

    expect(updates).toEqual(['IN_FLIGHT']);
    expect(billing.confirmReservation).not.toHaveBeenCalled();
    expect(billing.releaseReservation).not.toHaveBeenCalled();
  });

  it('releases the reservation if the durable RESERVED row cannot be created', async () => {
    const { coordinator, prisma, billing } = createHarness();
    prisma.aiOperation.create.mockRejectedValueOnce(new Error('create unavailable'));
    const providerCall = vi.fn();

    await expect(coordinator.execute(input, providerCall)).rejects.toThrow('create unavailable');

    expect(providerCall).not.toHaveBeenCalled();
    expect(billing.releaseReservation).toHaveBeenCalledWith(user, 'AI', 1, input.ref);
  });
});

describe('AiBillingCoordinator.reconcileStale', () => {
  it('releases safe states, confirms success, reviews ambiguity, and skips terminal states', async () => {
    const { coordinator, prisma, billing } = createHarness();
    const reservation = {
      resource: 'AI',
      amount: 1,
      refType: 'ai.chat',
      refId: null,
      idempotencyKey: 'op-key',
      operatorId: user.userId,
    };
    prisma.aiOperation.findMany.mockResolvedValue(
      ['RESERVED', 'FAILED', 'SUCCEEDED', 'IN_FLIGHT', 'REVIEW_REQUIRED', 'CONFIRMED', 'RELEASED']
        .map((status, index) => ({
          id: `operation-${index}`,
          tenantId: user.tenantId,
          userId: user.userId,
          operationKey: `op-${index}`,
          status,
          reservation: { ...reservation, idempotencyKey: `op-${index}` },
        })),
    );

    const result = await coordinator.reconcileStale({
      cutoff: new Date('2026-07-13T00:00:00.000Z'),
      take: 20,
    });

    expect(result).toEqual({
      scanned: 7,
      confirmed: 1,
      released: 2,
      reviewRequired: 2,
      skipped: 2,
      errors: [],
    });
    expect(billing.releaseReservation).toHaveBeenCalledTimes(2);
    expect(billing.confirmReservation).toHaveBeenCalledTimes(1);
    expect(prisma.aiOperation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'REVIEW_REQUIRED' },
    }));
  });
});
