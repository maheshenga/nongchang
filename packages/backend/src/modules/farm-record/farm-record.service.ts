import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, CreateFarmRecordDto, FarmRecordQueryDto, UpdateFarmRecordStatusDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import { PublicTraceCacheService } from '../public-trace/public-trace-cache.service';
import {
  assertSupplyQuotaWithinLimit,
  buildFarmRecordCreateData,
  buildFarmRecordTraceEventData,
  buildFarmRecordListFindManyArgs,
  buildFarmRecordListWhere,
  buildFarmRecordOwnerBatchWhere,
  buildFarmRecordOwnerWhere,
  enrichFarmRecordRows,
  serializeFarmRecord,
  shouldApplySupplyQuota,
  toPaginatedFarmRecords,
} from './farm-record.model';

@Injectable()
export class FarmRecordService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
    @Optional() private cache?: PublicTraceCacheService,
  ) {}

  private async lockTenantRow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    entity: 'batch' | 'field' | 'owner' | 'farmRecord' | 'supply',
    id: string,
  ): Promise<void> {
    let locked: Array<{ id: string }>;
    if (entity === 'batch') {
      locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM batches WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE
      `;
    } else if (entity === 'field') {
      locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM fields WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE
      `;
    } else if (entity === 'owner') {
      locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM users WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE
      `;
    } else if (entity === 'farmRecord') {
      locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM farm_records WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE
      `;
    } else {
      locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM supplies WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE
      `;
    }
    if (locked.length === 0) {
      throw new ForbiddenException(entity === 'supply' ? '农资不在可操作范围内' : '农事记录不在可操作范围内');
    }
  }

  private async loadLockedPublicationContext(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    source: { tenantId: string; batchId: string; fieldId: string },
    lockedBatchId: string,
  ): Promise<{ batchOwnerId: string; ownerDisplayName: string; fieldName: string }> {
    if (source.tenantId !== user.tenantId || source.batchId !== lockedBatchId) {
      throw new ForbiddenException('农事记录不在可操作范围内');
    }
    await this.scope.assertInScope(tx, user, 'batch', lockedBatchId);
    const candidate = await tx.batch.findFirst({
      where: { id: lockedBatchId },
      select: { id: true, tenantId: true, ownerId: true, fieldId: true },
    });
    if (!candidate
      || candidate.tenantId !== user.tenantId
      || candidate.fieldId !== source.fieldId) {
      throw new ForbiddenException('农事记录不在可操作范围内');
    }

    await this.lockTenantRow(tx, user.tenantId, 'field', source.fieldId);
    await this.lockTenantRow(tx, user.tenantId, 'owner', candidate.ownerId);
    await this.scope.assertInScope(tx, user, 'field', source.fieldId);
    const context = await tx.batch.findFirst({
      where: { id: lockedBatchId },
      select: {
        id: true,
        tenantId: true,
        ownerId: true,
        fieldId: true,
        owner: { select: { id: true, tenantId: true, displayName: true } },
        field: { select: { id: true, tenantId: true, ownerId: true, name: true } },
      },
    });
    const contextIsValid = context
      && context.id === source.batchId
      && context.tenantId === user.tenantId
      && context.fieldId === source.fieldId
      && context.field.id === source.fieldId
      && context.field.tenantId === user.tenantId
      && context.field.ownerId === context.ownerId
      && context.owner.id === context.ownerId
      && context.owner.tenantId === user.tenantId;
    if (!contextIsValid) throw new ForbiddenException('农事记录不在可操作范围内');
    return {
      batchOwnerId: context.ownerId,
      ownerDisplayName: context.owner.displayName,
      fieldName: context.field.name,
    };
  }

  private async createAndPublish(
    tx: Prisma.TransactionClient,
    data: Prisma.FarmRecordUncheckedCreateInput,
    context: { ownerDisplayName: string; fieldName: string },
  ) {
    const created = await tx.farmRecord.create({ data });
    if (created.status === 'completed') {
      await tx.traceEvent.create({
        data: buildFarmRecordTraceEventData({ record: created, ...context }),
      });
    }
    return created;
  }

  async create(user: AuthUser, dto: CreateFarmRecordDto) {
    const data = buildFarmRecordCreateData({ tenantId: user.tenantId, operatorId: user.userId, dto });
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockTenantRow(tx, user.tenantId, 'batch', dto.batchId);
      const context = await this.loadLockedPublicationContext(tx, user, data, dto.batchId);
      if (shouldApplySupplyQuota(dto)) {
        // 配额核销:读累计用量、判 110%、再写,三步必须原子。
        // 否则并发提交在"读"与"写"之间无锁(TOCTOU),可双双通过校验导致超额核销。
        // 用事务 + 对该 supply 行 FOR UPDATE 行锁串行化同一农资的并发核销。
        await this.lockTenantRow(tx, user.tenantId, 'supply', dto.supplyId!);
        const supplyScopeWhere = this.scope.ownedEntityWhere(user);
        const supply = await tx.supply.findFirst({
          where: { id: dto.supplyId, ...(supplyScopeWhere as object) } as Prisma.SupplyWhereInput,
          select: { id: true, tenantId: true, ownerId: true },
        });
        if (!supply
          || supply.tenantId !== user.tenantId
          || supply.ownerId !== context.batchOwnerId) {
          throw new ForbiddenException('农资不属于该批次归属商家,拒绝核销');
        }
        const quotaAgg = await tx.supplyIssue.aggregate({
          where: { tenantId: user.tenantId, batchId: dto.batchId, supplyId: dto.supplyId }, _sum: { amount: true },
        });
        const consumedAgg = await tx.farmRecord.aggregate({
          where: { tenantId: user.tenantId, batchId: dto.batchId, supplyId: dto.supplyId }, _sum: { supplyAmount: true },
        });
        assertSupplyQuotaWithinLimit({
          quota: quotaAgg._sum.amount ?? 0,
          consumed: consumedAgg._sum.supplyAmount ?? 0,
          requested: dto.supplyAmount!,
        });
      }
      return this.createAndPublish(tx, data, context);
    });
    if (created.status === 'completed') await this.cache?.invalidateBatch(dto.batchId);
    return serializeFarmRecord(created);
  }

  async list(user: AuthUser, query: FarmRecordQueryDto) {
    let batchScope: Prisma.BatchWhereInput | undefined;
    if (query.batchId) {
      // 指定批次:校验归属在调用方作用域内,fail-closed。
      await this.scope.assertInScope(this.prisma, user, 'batch', query.batchId);
    } else {
      // 未指定:限定在调用方作用域内的全部批次。
      batchScope = this.scope.ownedEntityWhere(user) as Prisma.BatchWhereInput;
    }
    const where = buildFarmRecordListWhere(user, query, batchScope);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.farmRecord.findMany(buildFarmRecordListFindManyArgs(where, query)),
      this.prisma.farmRecord.count({ where }),
    ]);
    if (items.length === 0) return toPaginatedFarmRecords(items, total, query);
    // 农事记录无 ownerId,经 batchId → Batch.ownerId → User.displayName 两跳解析归属商户名。
    const batchLookup = buildFarmRecordOwnerBatchWhere(items);
    const batches = batchLookup ? await this.prisma.batch.findMany(batchLookup) : [];
    const ownerLookup = buildFarmRecordOwnerWhere(batches);
    const owners = ownerLookup ? await this.prisma.user.findMany(ownerLookup) : [];
    const withOwner = enrichFarmRecordRows(items, batches, owners);
    return toPaginatedFarmRecords(withOwner, total, query);
  }

  // 状态流转:校验记录归属(经其 batchId 在调用方作用域内),再更新 status。
  async updateStatus(user: AuthUser, id: string, dto: UpdateFarmRecordStatusDto) {
    const scoped = await this.prisma.farmRecord.findFirst({
      where: { id, tenantId: user.tenantId }, select: { id: true, batchId: true },
    });
    if (!scoped) throw new ForbiddenException('农事记录不在可操作范围内');

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockTenantRow(tx, user.tenantId, 'batch', scoped.batchId);
      await this.lockTenantRow(tx, user.tenantId, 'farmRecord', id);
      const current = await tx.farmRecord.findFirst({
        where: { id, tenantId: user.tenantId },
      });
      if (!current) throw new ForbiddenException('农事记录不在可操作范围内');
      const context = await this.loadLockedPublicationContext(tx, user, current, scoped.batchId);
      const record = { ...current } as typeof current & { batch?: unknown; field?: unknown };
      delete record.batch;
      delete record.field;
      if (current.status === 'completed') {
        if (dto.status === 'pending') throw new BadRequestException('已完成农事记录不可退回待完成');
        return { record, published: false };
      }
      if (dto.status === 'pending') return { record, published: false };
      const completed = await tx.farmRecord.update({ where: { id }, data: { status: 'completed' } });
      await tx.traceEvent.create({
        data: buildFarmRecordTraceEventData({
          record: completed,
          ownerDisplayName: context.ownerDisplayName,
          fieldName: context.fieldName,
        }),
      });
      return { record: completed, published: true };
    });
    if (result.published) await this.cache?.invalidateBatch(scoped.batchId);
    return serializeFarmRecord(result.record);
  }
}
