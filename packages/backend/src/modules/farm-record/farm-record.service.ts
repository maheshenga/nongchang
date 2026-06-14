import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, CreateFarmRecordDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class FarmRecordService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  async create(user: AuthUser, dto: CreateFarmRecordDto) {
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
        supplyId: dto.supplyId ?? undefined, supplyAmount: dto.supplyAmount ?? undefined,
      },
    });
  }

  async list(user: AuthUser) {
    const batchWhere = await this.scope.ownedScopeWhere(this.prisma, user);
    const batches = await this.prisma.batch.findMany({ where: batchWhere, select: { id: true } });
    return this.prisma.farmRecord.findMany({
      where: { tenantId: user.tenantId, batchId: { in: batches.map(b => b.id) } },
    });
  }
}
