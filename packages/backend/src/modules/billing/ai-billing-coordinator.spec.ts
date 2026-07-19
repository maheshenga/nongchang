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
  const prisma: any = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(prisma)),
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
    reserveAiOperation: vi.fn().mockResolvedValue({
      existing: false,
      operation: { id: 'operation-1', status: 'RESERVED', resultEnvelope: null },
    }),
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
    const { coordinator, billing, updates } = createHarness();

    await expect(coordinator.execute(input, async () => 'answer')).resolves.toBe('answer');

    expect(billing.reserveAiOperation).toHaveBeenCalledWith({
      user,
      amount: 1,
      ref: input.ref,
      operation: { providerId: 'provider-1', kind: 'ai.chat', operationKey: 'op-key' },
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

  it('does not call the provider when atomic reservation creation fails', async () => {
    const { coordinator, billing } = createHarness();
    billing.reserveAiOperation.mockRejectedValueOnce(new Error('create unavailable'));
    const providerCall = vi.fn();

    await expect(coordinator.execute(input, providerCall)).rejects.toThrow('create unavailable');

    expect(providerCall).not.toHaveBeenCalled();
    expect(billing.releaseReservation).not.toHaveBeenCalled();
  });

  it('replays a confirmed sanitized result without calling the provider', async () => {
    const { coordinator, billing } = createHarness();
    billing.reserveAiOperation.mockResolvedValueOnce({
      existing: true,
      operation: { id: 'operation-1', status: 'CONFIRMED', resultEnvelope: 'cached-answer' },
    });
    const providerCall = vi.fn();

    await expect(coordinator.execute(input, providerCall)).resolves.toBe('cached-answer');
    expect(providerCall).not.toHaveBeenCalled();
  });

  it('returns HTTP 202 metadata while an existing operation is still in flight', async () => {
    const { coordinator, billing } = createHarness();
    billing.reserveAiOperation.mockResolvedValueOnce({
      existing: true,
      operation: { id: 'operation-1', status: 'IN_FLIGHT', resultEnvelope: null },
    });

    await expect(coordinator.execute(input, vi.fn())).rejects.toMatchObject({ status: 202 });
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
    prisma.$queryRaw
      .mockResolvedValueOnce(Array.from({ length: 7 }, (_, index) => ({ id: `operation-${index}` })))
      .mockResolvedValueOnce([]);

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

  it('quarantines orphan AI reservations instead of releasing them', async () => {
    const { coordinator, prisma, billing } = createHarness();
    prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'reservation-orphan', tenantId: user.tenantId, userId: user.userId,
        kind: 'ai.chat', operationKey: 'orphan-key',
      }]);

    const result = await coordinator.reconcileStale({ cutoff: new Date(), take: 10 });

    expect(result).toMatchObject({ scanned: 1, reviewRequired: 1, released: 0, errors: [] });
    expect(prisma.aiOperation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reservationId: 'reservation-orphan', status: 'REVIEW_REQUIRED', errorCategory: 'ORPHAN_RESERVATION',
      }),
    });
    expect(billing.releaseReservation).not.toHaveBeenCalled();
  });
});
