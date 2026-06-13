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
  private async scopedSupply(user: AuthUser, id: string): Promise<{ id: string; total: number; used: number }> {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    const sup = await this.prisma.supply.findFirst({ where: { id, ...(where as object) } as any });
    if (!sup) throw new ForbiddenException('农资不在可操作范围内');
    return sup as { id: string; total: number; used: number };
  }

  async issue(user: AuthUser, id: string, input: IssueSupplyInput): Promise<SupplyIssueResponse> {
    const sup = await this.scopedSupply(user, id);
    const remaining = sup.total - sup.used;
    if (input.amount > remaining) throw new BadRequestException('领用量超过剩余库存,超量熔断');
    const scopeWhere = await this.scope.ownedScopeWhere(this.prisma, user);
    const ownerId = (scopeWhere as { ownerId?: string }).ownerId ?? '';
    await this.prisma.$transaction(async (tx: any) => {
      await tx.supply.update({ where: { id }, data: { used: sup.used + input.amount } });
      await tx.supplyIssue.create({
        data: { tenantId: user.tenantId, ownerId, supplyId: id, batchId: input.batchId, amount: input.amount },
      });
    });
    return { supplyId: id, used: sup.used + input.amount, remaining: remaining - input.amount };
  }

  async remove(user: AuthUser, id: string): Promise<{ id: string }> {
    await this.scopedSupply(user, id);
    await this.prisma.supply.delete({ where: { id } });
    return { id };
  }
}
