import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, CreateFarmRecordDto, FarmRecordQueryDto, UpdateFarmRecordStatusDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import {
  assertSupplyQuotaWithinLimit,
  buildFarmRecordCreateData,
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
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  async create(user: AuthUser, dto: CreateFarmRecordDto) {
    await this.scope.assertInScope(this.prisma, user, 'batch', dto.batchId);
    await this.scope.assertInScope(this.prisma, user, 'field', dto.fieldId);
    const batch = await this.prisma.batch.findFirst({
      where: { id: dto.batchId, tenantId: user.tenantId, fieldId: dto.fieldId },
      select: { id: true, ownerId: true },
    });
    if (!batch) throw new ForbiddenException('地块不属于该批次,拒绝创建农事记录');
    const data = buildFarmRecordCreateData({ tenantId: user.tenantId, operatorId: user.userId, dto });
    if (shouldApplySupplyQuota(dto)) {
      // 校验 supply 在调用方作用域内,防止跨商家核销他人农资配额(只读鉴权,事务外)。
      const scopeWhere = this.scope.ownedEntityWhere(user);
      const sup = await this.prisma.supply.findFirst({
        where: { id: dto.supplyId, ...(scopeWhere as object) } as Prisma.SupplyWhereInput,
        select: { id: true, ownerId: true },
      });
      if (!sup) throw new ForbiddenException('农资不在可操作范围内');
      if (sup.ownerId !== batch.ownerId) throw new ForbiddenException('农资不属于该批次归属商家,拒绝核销');
      // 配额核销:读累计用量、判 110%、再写,三步必须原子。
      // 否则并发提交在"读"与"写"之间无锁(TOCTOU),可双双通过校验导致超额核销。
      // 用事务 + 对该 supply 行 FOR UPDATE 行锁串行化同一农资的并发核销。
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM batches WHERE id = ${dto.batchId} FOR UPDATE`;
        // 锁定 supply 行:并发核销同一农资的事务在此排队,保证后到者读到前者已提交的用量。
        await tx.$queryRaw`SELECT id FROM supplies WHERE id = ${dto.supplyId} FOR UPDATE`;
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
        return tx.farmRecord.create({ data });
      });
      return serializeFarmRecord(created);
    }
    const created = await this.prisma.farmRecord.create({ data });
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
    const rec = await this.prisma.farmRecord.findFirst({
      where: { id, tenantId: user.tenantId }, select: { id: true, batchId: true },
    });
    if (!rec) throw new ForbiddenException('农事记录不在可操作范围内');
    await this.scope.assertInScope(this.prisma, user, 'batch', rec.batchId);
    const updated = await this.prisma.farmRecord.update({ where: { id }, data: { status: dto.status } });
    return serializeFarmRecord(updated);
  }
}
