import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser, SupplyItem, CreateSupplyInput, IssueSupplyInput, SupplyIssueResponse, ListQuery, Paginated } from '@nongchang/shared';
import { isPaginated } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import {
  DEFAULT_SUPPLY_LIST_CAP,
  buildSupplyCreateData,
  buildSupplyIssueCreateData,
  buildSupplyIssueUpdate,
  toSupplyIssueResponse,
  toSupplyItem,
} from './supply.model';
import type { SupplyRow } from './supply.model';

@Injectable()
export class SupplyService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  // 向后兼容分页:不传 page/pageSize 返回裸数组(带默认安全上限);传了则返回分页信封。
  async list(user: AuthUser, query?: ListQuery): Promise<SupplyItem[] | Paginated<SupplyItem>> {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    if (isPaginated(query)) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.supply.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        this.prisma.supply.count({ where }),
      ]);
      return { items: (rows as SupplyRow[]).map(toSupplyItem), total, page, pageSize };
    }
    const rows = (await this.prisma.supply.findMany({ where, orderBy: { createdAt: 'desc' }, take: DEFAULT_SUPPLY_LIST_CAP })) as SupplyRow[];
    return rows.map(toSupplyItem);
  }

  async create(user: AuthUser, input: CreateSupplyInput): Promise<SupplyItem> {
    const scopeWhere = await this.scope.ownedScopeWhere(this.prisma, user);
    const ownerId = (scopeWhere as { ownerId?: string }).ownerId;
    if (!ownerId) throw new BadRequestException('当前角色无归属,无法登记农资(需 merchant)');
    const row = (await this.prisma.supply.create({
      data: buildSupplyCreateData({ tenantId: user.tenantId, ownerId, input }),
    })) as SupplyRow;
    return toSupplyItem(row);
  }

  /** 校验 supply 在作用域内,否则 fail-closed。 */
  private async scopedSupply(user: AuthUser, id: string): Promise<{ id: string; ownerId: string; total: Prisma.Decimal; used: Prisma.Decimal }> {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    const sup = await this.prisma.supply.findFirst({ where: { id, ...(where as object) } as any });
    if (!sup) throw new ForbiddenException('农资不在可操作范围内');
    return sup as { id: string; ownerId: string; total: Prisma.Decimal; used: Prisma.Decimal };
  }

  async issue(user: AuthUser, id: string, input: IssueSupplyInput): Promise<SupplyIssueResponse> {
    const sup = await this.scopedSupply(user, id);
    const batch = await this.prisma.batch.findFirst({
      where: { id: input.batchId, tenantId: user.tenantId, ownerId: sup.ownerId },
      select: { id: true },
    });
    if (!batch) throw new ForbiddenException('批次不属于该农资归属商家,拒绝领用');
    const result = await this.prisma.$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT id FROM batches WHERE id = ${input.batchId} FOR UPDATE`;
      // 条件原子自增:仅当 used + amount <= total(即 used <= total - amount)才扣减,
      // 避免事务外读快照导致的 lost update 超卖。count===0 即超量熔断。
      const upd = await tx.supply.updateMany(buildSupplyIssueUpdate({ supplyId: id, total: sup.total, amount: input.amount }));
      if (upd.count === 0) throw new BadRequestException('领用量超过剩余库存,超量熔断');
      await tx.supplyIssue.create({
        data: buildSupplyIssueCreateData({ tenantId: user.tenantId, ownerId: sup.ownerId, supplyId: id, batchId: input.batchId, issue: input }),
      });
      return (await tx.supply.findUnique({ where: { id } })) as { total: Prisma.Decimal; used: Prisma.Decimal };
    });
    return toSupplyIssueResponse(id, result);
  }

  async remove(user: AuthUser, id: string): Promise<{ id: string }> {
    await this.scopedSupply(user, id);
    // 有领用台账的农资禁止删除:supply_issues.supply_id 外键为 Restrict,
    // 直删会被 DB 拒(P2003)。此处提前拦截给出友好提示,且保留消耗历史可追溯。
    const issueCount = await this.prisma.supplyIssue.count({ where: { supplyId: id } });
    if (issueCount > 0) throw new BadRequestException('该农资已有领用记录,不可删除');
    await this.prisma.supply.delete({ where: { id } });
    return { id };
  }
}
