import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, BatchStatus, CreateBatchDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

const STATUS_ORDER = [BatchStatus.PLANTING, BatchStatus.GROWING, BatchStatus.HARVESTED, BatchStatus.DISTRIBUTED];

@Injectable()
export class BatchService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  async create(user: AuthUser, dto: CreateBatchDto) {
    const ownerId = await this.scope.resolveOwnerId(this.prisma, user, dto.ownerId);
    return this.prisma.batch.create({
      data: {
        tenantId: user.tenantId, ownerId, fieldId: dto.fieldId,
        batchNo: dto.batchNo, cropName: dto.cropName,
        plantDate: new Date(dto.plantDate), expectedHarvest: new Date(dto.expectedHarvest),
        status: dto.status,
      },
    });
  }

  async list(user: AuthUser) {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    const batches = await this.prisma.batch.findMany({ where });
    if (batches.length === 0) return [];
    const ids = batches.map((b: any) => b.id);
    const [codeAgg, issues] = await Promise.all([
      this.prisma.traceCode.groupBy({ by: ['batchId'], where: { batchId: { in: ids } }, _count: { _all: true }, _sum: { scanCount: true } }),
      this.prisma.supplyIssue.findMany({ where: { batchId: { in: ids } }, select: { batchId: true, amount: true, unitPrice: true } }),
    ]);
    const codeMap = new Map(codeAgg.map((c: any) => [c.batchId, { codeCount: c._count._all, scanTotal: c._sum.scanCount ?? 0 }]));
    const costMap = new Map<string, number>();
    for (const it of issues as any[]) costMap.set(it.batchId, (costMap.get(it.batchId) ?? 0) + it.amount * it.unitPrice);
    return batches.map((b: any) => ({
      ...b,
      codeCount: codeMap.get(b.id)?.codeCount ?? 0,
      scanTotal: codeMap.get(b.id)?.scanTotal ?? 0,
      inputCost: costMap.get(b.id) ?? 0,
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
    return this.prisma.batch.update({ where: { id }, data: { status } });
  }

  /** 成本编辑:人工成本/售价。 */
  async updateCost(user: AuthUser, id: string, dto: { laborCost?: number; sellPrice?: number }) {
    await this.scope.assertInScope(this.prisma, user, 'batch', id);
    return this.prisma.batch.update({
      where: { id },
      data: {
        ...(dto.laborCost != null ? { laborCost: dto.laborCost } : {}),
        ...(dto.sellPrice != null ? { sellPrice: dto.sellPrice } : {}),
      },
    });
  }

  /** 删除批次:已签发溯源码的批次禁止删除(防伪完整性),否则连带删除农事记录后删除批次。 */
  async remove(user: AuthUser, id: string) {
    await this.scope.assertInScope(this.prisma, user, 'batch', id);
    const codeCount = await this.prisma.traceCode.count({ where: { batchId: id } });
    if (codeCount > 0) {
      throw new BadRequestException('该批次已签发溯源码,不可删除');
    }
    await this.prisma.$transaction([
      this.prisma.farmRecord.deleteMany({ where: { batchId: id } }),
      this.prisma.batch.delete({ where: { id } }),
    ]);
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
      batch,
      farmRecords,
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
    return this.prisma.batch.findUnique({ where: { id: tc.batchId } });
  }
}
