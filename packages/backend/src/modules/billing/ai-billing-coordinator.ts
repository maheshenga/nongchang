import { Injectable } from '@nestjs/common';
import type { AuthUser } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from './billing.service';
import {
  recoveryActionForAiOperation,
  toAiOperationErrorCategory,
  type AiOperationState,
} from './ai-operation.model';

export interface AiBillingRef {
  refType: string;
  refId?: string;
  operatorId?: string;
  note?: string;
  idempotencyKey: string;
}

export interface AiBillingExecutionInput {
  user: AuthUser;
  providerId?: string | null;
  kind: string;
  operationKey: string;
  amount: number;
  ref: AiBillingRef;
}

export interface AiReconciliationResult {
  scanned: number;
  confirmed: number;
  released: number;
  reviewRequired: number;
  skipped: number;
  errors: Array<{ operationId: string; message: string }>;
}

export interface AiReconciliationQuery {
  cutoff: Date;
  take?: number;
  dryRun?: boolean;
}

@Injectable()
export class AiBillingCoordinator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  async execute<T>(
    input: AiBillingExecutionInput,
    providerCall: () => Promise<T>,
  ): Promise<T> {
    const reservation = await this.billing.reserve(input.user, 'AI', input.amount, input.ref);

    try {
      await this.prisma.aiOperation.create({
        data: {
          tenantId: input.user.tenantId,
          userId: input.user.userId,
          providerId: input.providerId ?? null,
          kind: input.kind,
          operationKey: input.operationKey,
          reservationId: reservation.reservationId,
          status: 'RESERVED',
        },
      });
    } catch (error) {
      try {
        await this.billing.releaseReservation(input.user, 'AI', input.amount, input.ref);
      } catch {
        // Preserve the durable-row failure; generic stale recovery can still inspect the reservation.
      }
      throw error;
    }

    await this.updateStatus(input, 'IN_FLIGHT');

    let result: T;
    try {
      result = await providerCall();
    } catch (providerError) {
      try {
        await this.prisma.aiOperation.update({
          where: this.operationWhere(input),
          data: {
            status: 'FAILED',
            errorCategory: toAiOperationErrorCategory(providerError),
          },
        });
      } catch {
        // The external outcome is ambiguous while the durable state remains IN_FLIGHT.
        throw providerError;
      }

      try {
        await this.billing.releaseReservation(input.user, 'AI', input.amount, input.ref);
        await this.updateStatus(input, 'RELEASED');
      } catch {
        // FAILED is safe for the reconciliation worker to release idempotently later.
      }
      throw providerError;
    }

    await this.updateStatus(input, 'SUCCEEDED');
    await this.billing.confirmReservation(input.user, 'AI', input.ref);
    await this.updateStatus(input, 'CONFIRMED');
    return result;
  }

  async reconcileStale(query: AiReconciliationQuery): Promise<AiReconciliationResult> {
    const take = query.take ?? 100;
    if (!Number.isInteger(take) || take <= 0 || take > 1000) {
      throw new Error('take must be an integer between 1 and 1000');
    }

    const operations = await this.prisma.aiOperation.findMany({
      where: {
        createdAt: { lt: query.cutoff },
        status: {
          in: ['RESERVED', 'FAILED', 'SUCCEEDED', 'IN_FLIGHT', 'REVIEW_REQUIRED'],
        },
      },
      orderBy: { createdAt: 'asc' },
      take,
      select: {
        id: true,
        tenantId: true,
        userId: true,
        operationKey: true,
        status: true,
        reservation: {
          select: {
            resource: true,
            amount: true,
            refType: true,
            refId: true,
            idempotencyKey: true,
            operatorId: true,
          },
        },
      },
    });

    const result: AiReconciliationResult = {
      scanned: operations.length,
      confirmed: 0,
      released: 0,
      reviewRequired: 0,
      skipped: 0,
      errors: [],
    };

    for (const operation of operations) {
      const action = recoveryActionForAiOperation(operation.status as AiOperationState);
      if (action === 'skip' || query.dryRun) {
        result.skipped += 1;
        continue;
      }

      try {
        if (action === 'review') {
          await this.prisma.aiOperation.update({
            where: { id: operation.id },
            data: { status: 'REVIEW_REQUIRED' },
          });
          result.reviewRequired += 1;
          continue;
        }

        const reservation = operation.reservation;
        if (!reservation || reservation.resource !== 'AI') {
          throw new Error('AI operation reservation is missing or invalid');
        }
        const actor = await this.reconciliationActor(operation.userId, operation.tenantId);
        const ref: AiBillingRef = {
          refType: reservation.refType ?? operation.operationKey,
          ...(reservation.refId ? { refId: reservation.refId } : {}),
          ...(reservation.operatorId ? { operatorId: reservation.operatorId } : {}),
          idempotencyKey: reservation.idempotencyKey,
        };

        if (action === 'release') {
          await this.billing.releaseReservation(actor, 'AI', reservation.amount, ref);
          await this.prisma.aiOperation.update({
            where: { id: operation.id },
            data: { status: 'RELEASED' },
          });
          result.released += 1;
        } else {
          await this.billing.confirmReservation(actor, 'AI', ref);
          await this.prisma.aiOperation.update({
            where: { id: operation.id },
            data: { status: 'CONFIRMED' },
          });
          result.confirmed += 1;
        }
      } catch (error) {
        result.errors.push({
          operationId: operation.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  private operationWhere(input: AiBillingExecutionInput) {
    return {
      tenantId_operationKey: {
        tenantId: input.user.tenantId,
        operationKey: input.operationKey,
      },
    };
  }

  private updateStatus(input: AiBillingExecutionInput, status: AiOperationState) {
    return this.prisma.aiOperation.update({
      where: this.operationWhere(input),
      data: { status },
    });
  }

  private async reconciliationActor(userId: string, tenantId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        role: true,
        agentId: true,
        sessionVersion: true,
      },
    });
    if (!user || user.tenantId !== tenantId) {
      throw new Error('AI operation user is missing or belongs to another tenant');
    }

    return {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      agentId: user.agentId ?? null,
      ownerId: user.role === 'merchant' ? user.id : null,
      sessionVersion: user.sessionVersion ?? 0,
    };
  }
}
