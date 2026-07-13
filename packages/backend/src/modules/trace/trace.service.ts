import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthUser, CreateTraceEventDto, ListQuery, Paginated } from '@nongchang/shared';
import { isPaginated } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import { BillingService } from '../billing/billing.service';
import { PublicTraceCacheService } from '../public-trace/public-trace-cache.service';
import { IdempotencyLockService } from '../../common/runtime/idempotency-lock.service';
import {
  MAX_CODES_PER_BATCH,
  assertTraceGenerationCount,
  assertTraceGenerationRetryCount,
  buildTraceCodeCreateData,
  buildTraceCodeLookup,
  buildTraceGenerationKey,
  buildTraceGenerationRef,
  normalizeTraceGenerationRequestKey,
} from './trace.model';

@Injectable()
export class TraceService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
    private billing: BillingService,
    @Optional() private cache?: PublicTraceCacheService,
    @Optional() private locks?: IdempotencyLockService,
  ) {}

  /** 一物一码:为批次批量生成 count 个唯一溯源码并返回。 */
  async generateCodes(user: AuthUser, batchId: string, count = 1, requestKey?: string) {
    assertTraceGenerationCount(count);
    const normalizedRequestKey = normalizeTraceGenerationRequestKey(requestKey);
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
    const generationKey = buildTraceGenerationKey({
      tenantId: user.tenantId,
      userId: user.userId,
      batchId,
      requestKey: normalizedRequestKey,
    });
    const execute = async () => {
      const ref = buildTraceGenerationRef(batchId, generationKey);
      const traceCodeLookup = buildTraceCodeLookup(user.tenantId, batchId, generationKey);
      const existingCodes = await this.prisma.traceCode.findMany(traceCodeLookup);
      if (existingCodes.length > 0) {
        assertTraceGenerationRetryCount(existingCodes.length, count);
        await this.billing.confirmReservation(user, 'CODE', ref);
        return existingCodes;
      }
      const reservation = await this.billing.reserve(user, 'CODE', count, ref);
      const codes = Array.from({ length: count }, () => `ORC-${randomUUID().slice(0, 12).toUpperCase()}`);
      try {
        await this.prisma.$transaction(async (tx) => {
          const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM batches WHERE id = ${batchId} FOR UPDATE`;
          if (locked.length === 0) throw new NotFoundException('批次不存在');
          const existingCodes = await tx.traceCode.findMany(traceCodeLookup);
          if (existingCodes.length > 0) {
            assertTraceGenerationRetryCount(existingCodes.length, count);
            return;
          }
          await tx.traceCode.createMany({
            data: buildTraceCodeCreateData({
              tenantId: user.tenantId,
              batchId,
              reservationId: reservation.reservationId,
              codes,
              generationKey,
            }),
          });
        });
      } catch (err) {
        await this.billing.releaseReservation(user, 'CODE', count, ref);
        throw err;
      }
      await this.billing.confirmReservation(user, 'CODE', ref);
      return this.prisma.traceCode.findMany({
        where: { tenantId: user.tenantId, batchId, generationKey },
        orderBy: { createdAt: 'asc' },
      });
    };
    return this.locks
      ? this.locks.run(`trace:${generationKey}`, execute)
      : execute();
  }

  async addEvent(user: AuthUser, dto: CreateTraceEventDto) {
    await this.scope.assertInScope(this.prisma, user, 'batch', dto.batchId);
    const event = await this.prisma.traceEvent.create({
      data: {
        tenantId: user.tenantId, batchId: dto.batchId, type: dto.type, title: dto.title,
        actor: dto.actor, location: dto.location, occurredAt: new Date(dto.occurredAt),
        payload: (dto.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    await this.cache?.invalidateBatch(dto.batchId);
    return event;
  }

  // 向后兼容分页:不传 page/pageSize 返回裸数组(带默认安全上限);传了则返回分页信封。
  async listEvents(user: AuthUser, batchId: string, query?: ListQuery): Promise<any[] | Paginated<any>> {
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
    const where = { tenantId: user.tenantId, batchId };
    if (isPaginated(query)) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const [items, total] = await this.prisma.$transaction([
        this.prisma.traceEvent.findMany({ where, orderBy: { occurredAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
        this.prisma.traceEvent.count({ where }),
      ]);
      return { items, total, page, pageSize };
    }
    return this.prisma.traceEvent.findMany({ where, orderBy: { occurredAt: 'asc' }, take: 500 });
  }

  /** 列出批次已生成的全部溯源码(含各自扫码次数),最新在前。
   *  未分页时默认安全上限 = MAX_CODES_PER_BATCH(与生码上限一致,不会截断合法的全量码列表)。 */
  async listCodes(user: AuthUser, batchId: string, query?: ListQuery): Promise<any[] | Paginated<any>> {
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
    const where = { tenantId: user.tenantId, batchId };
    if (isPaginated(query)) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const [items, total] = await this.prisma.$transaction([
        this.prisma.traceCode.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        this.prisma.traceCode.count({ where }),
      ]);
      return { items, total, page, pageSize };
    }
    return this.prisma.traceCode.findMany({ where, orderBy: { createdAt: 'desc' }, take: MAX_CODES_PER_BATCH });
  }
}
