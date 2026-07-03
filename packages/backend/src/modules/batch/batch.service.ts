import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, BatchStatus, CreateBatchDto, ListQuery, Paginated } from '@nongchang/shared';
import { isPaginated } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

const STATUS_ORDER = [BatchStatus.PLANTING, BatchStatus.GROWING, BatchStatus.HARVESTED, BatchStatus.DISTRIBUTED];
// 未分页时的默认安全上限:防无界结果集。
const DEFAULT_LIST_CAP = 500;

// 金额列(laborCost/sellPrice)为 Prisma.Decimal,出口统一转 number 以保持前端 API 契约不变。
function serializeBatch<T extends Record<string, any> | null>(b: T): T {
  if (!b) return b;
  const out: any = { ...b };
  if (out.laborCost != null) out.laborCost = new Prisma.Decimal(out.laborCost).toNumber();
  if (out.sellPrice != null) out.sellPrice = new Prisma.Decimal(out.sellPrice).toNumber();
  return out;
}

@Injectable()
export class BatchService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  async create(user: AuthUser, dto: CreateBatchDto) {
    const ownerId = await this.scope.resolveOwnerId(this.prisma, user, dto.ownerId);
    // 校验 fieldId 归属:防止引用他人地块,避免公开溯源页泄露受害方地块名称与经纬度。
    await this.scope.assertInScope(this.prisma, user, 'field', dto.fieldId);
    const field = await this.prisma.field.findFirst({
      where: { id: dto.fieldId, tenantId: user.tenantId, ownerId },
      select: { id: true },
    });
    if (!field) throw new ForbiddenException('地块不属于目标商家,拒绝创建批次');
    const created = await this.prisma.batch.create({
      data: {
        tenantId: user.tenantId, ownerId, fieldId: dto.fieldId,
        batchNo: dto.batchNo, cropName: dto.cropName,
        plantDate: new Date(dto.plantDate), expectedHarvest: new Date(dto.expectedHarvest),
        status: dto.status,
      },
    });
    return serializeBatch(created);
  }

  // 向后兼容分页:不传 page/pageSize 返回裸数组(带默认安全上限);传了则返回分页信封。
  async list(user: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    if (isPaginated(query)) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const [batches, total] = await this.prisma.$transaction([
        this.prisma.batch.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        this.prisma.batch.count({ where }),
      ]);
      return { items: await this.enrich(batches as any[]), total, page, pageSize };
    }
    const batches = await this.prisma.batch.findMany({ where, orderBy: { createdAt: 'desc' }, take: DEFAULT_LIST_CAP });
    return this.enrich(batches as any[]);
  }

  // 给一页 batches 补 ownerName / 码统计(数量+扫码总数)/ 投入成本。
  private async enrich(batches: any[]): Promise<any[]> {
    if (batches.length === 0) return [];
    const ids = batches.map((b: any) => b.id);
    const ownerIds = [...new Set(batches.map((b: any) => b.ownerId))];
    const [codeAgg, issues, owners] = await Promise.all([
      this.prisma.traceCode.groupBy({ by: ['batchId'], where: { batchId: { in: ids } }, _count: { _all: true }, _sum: { scanCount: true } }),
      this.prisma.supplyIssue.findMany({ where: { batchId: { in: ids } }, select: { batchId: true, amount: true, unitPrice: true } }),
      this.prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, displayName: true } }),
    ]);
    const codeMap = new Map(codeAgg.map((c: any) => [c.batchId, { codeCount: c._count._all, scanTotal: c._sum.scanCount ?? 0 }]));
    const nameMap = new Map(owners.map((o: any) => [o.id, o.displayName]));
    // 投入成本用 Decimal 精确累加(金额列为 Decimal),出口再转 number 保持 API 契约。
    const costMap = new Map<string, Prisma.Decimal>();
    for (const it of issues as any[]) {
      const add = new Prisma.Decimal(it.amount).times(it.unitPrice);
      costMap.set(it.batchId, (costMap.get(it.batchId) ?? new Prisma.Decimal(0)).plus(add));
    }
    return batches.map((b: any) => ({
      ...b,
      laborCost: new Prisma.Decimal(b.laborCost).toNumber(),
      sellPrice: new Prisma.Decimal(b.sellPrice).toNumber(),
      ownerName: nameMap.get(b.ownerId) ?? null,
      codeCount: codeMap.get(b.id)?.codeCount ?? 0,
      scanTotal: codeMap.get(b.id)?.scanTotal ?? 0,
      inputCost: (costMap.get(b.id) ?? new Prisma.Decimal(0)).toNumber(),
    }));
  }

  /** 状态流转:仅允许沿 STATUS_ORDER 前进,回退/同态非法。 */
  async updateStatus(user: AuthUser, id: string, status: string) {
    await this.scope.assertInScope(this.prisma, user, 'batch', id);
    const cur = await this.prisma.batch.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('批次不存在');
    if (STATUS_ORDER.indexOf(status as any) <= STATUS_ORDER.indexOf(cur.status as any)) {
      throw new BadRequestException('非法的状态流转');
    }
    return serializeBatch(await this.prisma.batch.update({ where: { id }, data: { status } }));
  }

  /** 成本编辑:人工成本/售价。 */
  async updateCost(user: AuthUser, id: string, dto: { laborCost?: number; sellPrice?: number }) {
    await this.scope.assertInScope(this.prisma, user, 'batch', id);
    return serializeBatch(await this.prisma.batch.update({
      where: { id },
      data: {
        ...(dto.laborCost != null ? { laborCost: dto.laborCost } : {}),
        ...(dto.sellPrice != null ? { sellPrice: dto.sellPrice } : {}),
      },
    }));
  }

  /** 删除批次:默认禁止删除已签发溯源码的批次;force=true 可强删未流通的批次。
   *  但只要任一溯源码已被扫描(进入公众流通),即使 force 也禁止硬删——否则实物上的码会变成 404 死链,破坏溯源可信度。 */
  async remove(user: AuthUser, id: string, force = false) {
    await this.scope.assertInScope(this.prisma, user, 'batch', id);
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM batches WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('批次不存在');
      const codeCount = await tx.traceCode.count({ where: { batchId: id } });
      if (codeCount > 0 && !force) {
        throw new BadRequestException('该批次已签发溯源码,不可删除');
      }
      if (codeCount > 0 && force) {
        const scannedCount = await tx.traceScan.count({ where: { batchId: id } });
        if (scannedCount > 0) {
          throw new BadRequestException('该批次的溯源码已被扫码流通,禁止硬删除(会造成实物溯源死链)');
        }
      }
      const issues = await tx.supplyIssue.findMany({
        where: { batchId: id },
        select: { supplyId: true, amount: true },
      });
      const restoreBySupply = new Map<string, Prisma.Decimal>();
      for (const issue of issues as Array<{ supplyId: string; amount: Prisma.Decimal | number }>) {
        restoreBySupply.set(
          issue.supplyId,
          (restoreBySupply.get(issue.supplyId) ?? new Prisma.Decimal(0)).plus(issue.amount),
        );
      }
      for (const [supplyId, amount] of restoreBySupply) {
        const upd = await tx.supply.updateMany({
          where: { id: supplyId, used: { gte: amount } },
          data: { used: { decrement: amount } },
        });
        if (upd.count === 0) throw new BadRequestException('农资库存台账异常,拒绝删除批次');
      }
      await tx.traceScan.deleteMany({ where: { batchId: id } });
      await tx.traceEvent.deleteMany({ where: { batchId: id } });
      await tx.traceCredential.deleteMany({ where: { batchId: id } });
      await tx.traceCode.deleteMany({ where: { batchId: id } });
      await tx.supplyIssue.deleteMany({ where: { batchId: id } });
      await tx.farmRecord.deleteMany({ where: { batchId: id } });
      await tx.batch.delete({ where: { id } });
    });
    return { id };
  }

  /** 生命周期下钻:批次本体 + 农事 + 溯源事件 + 码统计 + 近期扫码。 */
  async lifecycle(user: AuthUser, id: string) {
    await this.scope.assertInScope(this.prisma, user, 'batch', id);
    const [batch, farmRecords, traceEvents, codeAgg, scans] = await Promise.all([
      this.prisma.batch.findUnique({ where: { id } }),
      this.prisma.farmRecord.findMany({ where: { batchId: id }, orderBy: { recordedAt: 'asc' } }),
      this.prisma.traceEvent.findMany({ where: { batchId: id }, orderBy: { occurredAt: 'asc' } }),
      this.prisma.traceCode.aggregate({ where: { batchId: id }, _count: { _all: true }, _sum: { scanCount: true } }),
      this.prisma.traceScan.findMany({ where: { batchId: id }, orderBy: { scannedAt: 'desc' }, take: 10, select: { scannedAt: true } }),
    ]);
    return {
      batch: serializeBatch(batch),
      farmRecords: (farmRecords as any[]).map((r) => ({ ...r, supplyAmount: r.supplyAmount != null ? new Prisma.Decimal(r.supplyAmount).toNumber() : null })),
      traceEvents,
      codeCount: codeAgg._count._all,
      scanTotal: codeAgg._sum.scanCount ?? 0,
      recentScans: scans,
    };
  }

  /** 扫码回填:按溯源码解析批次,并校验归属在调用方范围内。 */
  async findByTraceCode(user: AuthUser, code: string) {
    const tc = await this.prisma.traceCode.findFirst({ where: { code, tenantId: user.tenantId } });
    if (!tc) throw new NotFoundException('溯源码不存在');
    // 归属校验:不在范围则 fail-closed 抛 Forbidden。
    await this.scope.assertInScope(this.prisma, user, 'batch', tc.batchId);
    return serializeBatch(await this.prisma.batch.findUnique({ where: { id: tc.batchId } }));
  }
}
