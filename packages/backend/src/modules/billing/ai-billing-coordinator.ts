import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    const reserved = await this.billing.reserveAiOperation({
      user: input.user,
      amount: input.amount,
      ref: input.ref,
      operation: {
        providerId: input.providerId ?? null,
        kind: input.kind,
        operationKey: input.operationKey,
      },
    });
    if (reserved.existing) return this.handleExisting<T>(reserved.operation);

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
    await this.updateStatus(input, 'CONFIRMED', { resultEnvelope: result as Prisma.InputJsonValue });
    return result;
  }

  private handleExisting<T>(operation: { id: string; status: string; resultEnvelope?: unknown }): T {
    if (operation.status === 'CONFIRMED' && operation.resultEnvelope !== null && operation.resultEnvelope !== undefined) {
      return operation.resultEnvelope as T;
    }
    if (['RESERVED', 'IN_FLIGHT', 'SUCCEEDED'].includes(operation.status)) {
      throw new HttpException({
        statusCode: HttpStatus.ACCEPTED,
        code: 'AI_OPERATION_IN_PROGRESS',
        operationId: operation.id,
        status: operation.status,
        retryAfterSeconds: 2,
      }, HttpStatus.ACCEPTED);
    }
    const code = operation.status === 'REVIEW_REQUIRED'
      ? 'AI_OPERATION_REVIEW_REQUIRED'
      : operation.status === 'CONFIRMED'
        ? 'AI_RESULT_NOT_REPLAYABLE'
        : 'AI_OPERATION_TERMINAL_FAILURE';
    throw new HttpException({
      statusCode: HttpStatus.CONFLICT,
      code,
      operationId: operation.id,
      status: operation.status,
    }, HttpStatus.CONFLICT);
  }

  async reconcileStale(query: AiReconciliationQuery): Promise<AiReconciliationResult> {
    const take = query.take ?? 100;
    if (!Number.isInteger(take) || take <= 0 || take > 1000) {
      throw new Error('take must be an integer between 1 and 1000');
    }

    const candidateIds = await this.prisma.$transaction(async (tx) => tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM ai_operations
      WHERE created_at < ${query.cutoff}
        AND status IN ('RESERVED', 'FAILED', 'SUCCEEDED', 'IN_FLIGHT', 'REVIEW_REQUIRED')
      ORDER BY created_at ASC
      LIMIT ${take}
      FOR UPDATE SKIP LOCKED
    `);
    const operations = await this.prisma.aiOperation.findMany({
      where: {
        id: { in: candidateIds.map((row) => row.id) },
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

    const orphanLimit = Math.max(0, take - operations.length);
    const orphans = orphanLimit === 0 ? [] : await this.prisma.$transaction(async (tx) => tx.$queryRaw<Array<{
      id: string; tenantId: string; userId: string | null; kind: string | null; operationKey: string;
    }>>`
      SELECT r.id, r.tenant_id AS "tenantId", r.operator_id AS "userId",
             r.ref_type AS kind, r.idempotency_key AS "operationKey"
      FROM credit_reservations r
      LEFT JOIN ai_operations o ON o.reservation_id = r.id
      WHERE r.resource = 'AI' AND r.status = 'RESERVED'
        AND r.created_at < ${query.cutoff} AND o.id IS NULL
      ORDER BY r.created_at ASC
      LIMIT ${orphanLimit}
      FOR UPDATE OF r SKIP LOCKED
    `);

    const result: AiReconciliationResult = {
      scanned: operations.length + orphans.length,
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

    for (const orphan of orphans) {
      if (query.dryRun) {
        result.skipped += 1;
        continue;
      }
      try {
        if (!orphan.userId) throw new Error('Orphan AI reservation has no operator');
        await this.prisma.aiOperation.create({
          data: {
            tenantId: orphan.tenantId,
            userId: orphan.userId,
            providerId: null,
            kind: orphan.kind ?? 'ai.orphan',
            operationKey: orphan.operationKey,
            reservationId: orphan.id,
            status: 'REVIEW_REQUIRED',
            errorCategory: 'ORPHAN_RESERVATION',
          },
        });
        result.reviewRequired += 1;
      } catch (error) {
        if ((error as { code?: string })?.code === 'P2002') {
          result.skipped += 1;
          continue;
        }
        result.errors.push({
          operationId: orphan.id,
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

  private updateStatus(
    input: AiBillingExecutionInput,
    status: AiOperationState,
    extra: { resultEnvelope?: Prisma.InputJsonValue } = {},
  ) {
    return this.prisma.aiOperation.update({
      where: this.operationWhere(input),
      data: { status, ...extra },
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
