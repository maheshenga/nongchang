import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser, SupplyItem, CreateSupplyInput, IssueSupplyInput, SupplyIssueResponse } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

const LOW_STOCK_THRESHOLD = 10;

interface SupplyRow { id: string; name: string; unit: string; total: number; used: number; createdAt: Date; }

function toItem(r: SupplyRow): SupplyItem {
  const remaining = r.total - r.used;
  return { id: r.id, name: r.name, unit: r.unit, total: r.total, used: r.used,
    remaining, alert: remaining < LOW_STOCK_THRESHOLD, createdAt: r.createdAt.toISOString() };
}

@Injectable()
export class SupplyService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  async list(user: AuthUser): Promise<SupplyItem[]> {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    const rows = (await this.prisma.supply.findMany({ where, orderBy: { createdAt: 'desc' } })) as SupplyRow[];
    return rows.map(toItem);
  }

  async create(user: AuthUser, input: CreateSupplyInput): Promise<SupplyItem> {
    const scopeWhere = await this.scope.ownedScopeWhere(this.prisma, user);
    const ownerId = (scopeWhere as { ownerId?: string }).ownerId;
    if (!ownerId) throw new BadRequestException('当前角色无归属,无法登记农资(需 merchant)');
    const row = (await this.prisma.supply.create({
      data: { tenantId: user.tenantId, ownerId, name: input.name, unit: input.unit, total: input.amount, used: 0 },
    })) as SupplyRow;
    return toItem(row);
  }

  /** 校验 supply 在作用域内,否则 fail-closed。 */
  private async scopedSupply(user: AuthUser, id: string): Promise<{ id: string; ownerId: string; total: number; used: number }> {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    const sup = await this.prisma.supply.findFirst({ where: { id, ...(where as object) } as any });
    if (!sup) throw new ForbiddenException('农资不在可操作范围内');
    return sup as { id: string; ownerId: string; total: number; used: number };
  }

  async issue(user: AuthUser, id: string, input: IssueSupplyInput): Promise<SupplyIssueResponse> {
    const sup = await this.scopedSupply(user, id);
    const result = await this.prisma.$transaction(async (tx: any) => {
      // 条件原子自增:仅当 used + amount <= total(即 used <= total - amount)才扣减,
      // 避免事务外读快照导致的 lost update 超卖。count===0 即超量熔断。
      const upd = await tx.supply.updateMany({
        where: { id, used: { lte: sup.total - input.amount } },
        data: { used: { increment: input.amount } },
      });
      if (upd.count === 0) throw new BadRequestException('领用量超过剩余库存,超量熔断');
      await tx.supplyIssue.create({
        data: { tenantId: user.tenantId, ownerId: sup.ownerId, supplyId: id, batchId: input.batchId, amount: input.amount },
      });
      return (await tx.supply.findUnique({ where: { id } })) as { total: number; used: number };
    });
    return { supplyId: id, used: result.used, remaining: result.total - result.used };
  }

  async remove(user: AuthUser, id: string): Promise<{ id: string }> {
    await this.scopedSupply(user, id);
    await this.prisma.supply.delete({ where: { id } });
    return { id };
  }
}
