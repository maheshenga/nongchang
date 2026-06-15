import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, CreateFarmRecordDto, FarmRecordQueryDto, UpdateFarmRecordStatusDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class FarmRecordService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  async create(user: AuthUser, dto: CreateFarmRecordDto) {
    await this.scope.assertInScope(this.prisma, user, 'batch', dto.batchId);
    await this.scope.assertInScope(this.prisma, user, 'field', dto.fieldId);
    if (dto.supplyId && dto.supplyAmount != null) {
      // 校验 supply 在调用方作用域内,防止跨商家核销他人农资配额。
      const scopeWhere = await this.scope.ownedScopeWhere(this.prisma, user);
      const sup = await this.prisma.supply.findFirst({
        where: { id: dto.supplyId, ...(scopeWhere as object) } as Prisma.SupplyWhereInput,
        select: { id: true },
      });
      if (!sup) throw new ForbiddenException('农资不在可操作范围内');
      const quotaAgg = await this.prisma.supplyIssue.aggregate({
        where: { tenantId: user.tenantId, batchId: dto.batchId, supplyId: dto.supplyId }, _sum: { amount: true },
      });
      const consumedAgg = await this.prisma.farmRecord.aggregate({
        where: { tenantId: user.tenantId, batchId: dto.batchId, supplyId: dto.supplyId }, _sum: { supplyAmount: true },
      });
      const quota = quotaAgg._sum.amount ?? 0;
      const consumed = consumedAgg._sum.supplyAmount ?? 0;
      if (consumed + dto.supplyAmount > quota * 1.1) {
        throw new BadRequestException('实际用量超过领用配额 110%,核销熔断');
      }
    }
    return this.prisma.farmRecord.create({
      data: {
        tenantId: user.tenantId, batchId: dto.batchId, fieldId: dto.fieldId,
        operatorId: user.userId, action: dto.action,
        detail: (dto.detail ?? undefined) as Prisma.InputJsonValue | undefined,
        images: (dto.images ?? undefined) as Prisma.InputJsonValue | undefined,
        location: dto.location ?? null, recordedAt: new Date(dto.recordedAt), source: dto.source,
        status: dto.status ?? 'completed',
        supplyId: dto.supplyId ?? undefined, supplyAmount: dto.supplyAmount ?? undefined,
      },
    });
  }

  async list(user: AuthUser, query: FarmRecordQueryDto) {
    const { batchId, action, status, page, pageSize } = query;
    const where: Prisma.FarmRecordWhereInput = { tenantId: user.tenantId };
    if (batchId) {
      // 指定批次:校验归属在调用方作用域内,fail-closed。
      await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
      where.batchId = batchId;
    } else {
      // 未指定:限定在调用方作用域内的全部批次。
      const batchWhere = await this.scope.ownedScopeWhere(this.prisma, user);
      const batches = await this.prisma.batch.findMany({ where: batchWhere, select: { id: true } });
      where.batchId = { in: batches.map(b => b.id) };
    }
    // action 模糊匹配(不区分大小写),status 精确匹配。
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (status) where.status = status;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.farmRecord.findMany({
        where, orderBy: { recordedAt: 'desc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
      this.prisma.farmRecord.count({ where }),
    ]);
    if (items.length === 0) return { items, total, page, pageSize };
    // 农事记录无 ownerId,经 batchId → Batch.ownerId → User.displayName 两跳解析归属商户名。
    const batchIds = [...new Set(items.map(r => r.batchId))];
    const batches = await this.prisma.batch.findMany({
      where: { id: { in: batchIds } }, select: { id: true, ownerId: true },
    });
    const batchOwner = new Map(batches.map((b: any) => [b.id, b.ownerId]));
    const ownerIds = [...new Set(batches.map((b: any) => b.ownerId))];
    const owners = await this.prisma.user.findMany({
      where: { id: { in: ownerIds } }, select: { id: true, displayName: true },
    });
    const nameMap = new Map(owners.map((o: any) => [o.id, o.displayName]));
    const withOwner = items.map(r => ({ ...r, ownerName: nameMap.get(batchOwner.get(r.batchId) as string) ?? null }));
    return { items: withOwner, total, page, pageSize };
  }

  // 状态流转:校验记录归属(经其 batchId 在调用方作用域内),再更新 status。
  async updateStatus(user: AuthUser, id: string, dto: UpdateFarmRecordStatusDto) {
    const rec = await this.prisma.farmRecord.findFirst({
      where: { id, tenantId: user.tenantId }, select: { id: true, batchId: true },
    });
    if (!rec) throw new ForbiddenException('农事记录不在可操作范围内');
    await this.scope.assertInScope(this.prisma, user, 'batch', rec.batchId);
    return this.prisma.farmRecord.update({ where: { id }, data: { status: dto.status } });
  }
}
