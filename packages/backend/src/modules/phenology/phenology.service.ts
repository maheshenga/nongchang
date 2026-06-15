import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AuthUser, CreateCropPhenologyDto, UpdateCropPhenologyDto, CropPhenologyItem, BatchDeviation,
} from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

// 实际累计天数超过标准物候全周期 + 阈值 即判定滞后预警。
const DEVIATION_THRESHOLD_DAYS = 7;
// 已收获/已分销的批次不再计偏离(生命周期已结束)。
const TERMINAL_STATUSES = new Set(['Harvested', 'Distributed']);

interface PhenologyRow {
  id: string; tenantId: string; cropName: string; stage: string;
  expectedDays: number; sortOrder: number; createdAt: Date;
}

function toItem(r: PhenologyRow): CropPhenologyItem {
  return {
    id: r.id, tenantId: r.tenantId, cropName: r.cropName, stage: r.stage,
    expectedDays: r.expectedDays, sortOrder: r.sortOrder, createdAt: r.createdAt.toISOString(),
  };
}

@Injectable()
export class PhenologyService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  // 标准物候模型为租户级公共配置,按 cropName + sortOrder 排序返回。
  async list(user: AuthUser): Promise<CropPhenologyItem[]> {
    const rows = (await this.prisma.cropPhenology.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ cropName: 'asc' }, { sortOrder: 'asc' }],
    })) as PhenologyRow[];
    return rows.map(toItem);
  }

  async create(user: AuthUser, dto: CreateCropPhenologyDto): Promise<CropPhenologyItem> {
    const row = (await this.prisma.cropPhenology.create({
      data: {
        tenantId: user.tenantId, cropName: dto.cropName, stage: dto.stage,
        expectedDays: dto.expectedDays, sortOrder: dto.sortOrder,
      },
    })) as PhenologyRow;
    return toItem(row);
  }

  async update(user: AuthUser, id: string, dto: UpdateCropPhenologyDto): Promise<CropPhenologyItem> {
    const existing = await this.prisma.cropPhenology.findFirst({
      where: { id, tenantId: user.tenantId }, select: { id: true },
    });
    if (!existing) throw new ForbiddenException('物候阶段不在可操作范围内');
    const row = (await this.prisma.cropPhenology.update({
      where: { id },
      data: {
        stage: dto.stage ?? undefined,
        expectedDays: dto.expectedDays ?? undefined,
        sortOrder: dto.sortOrder ?? undefined,
      },
    })) as PhenologyRow;
    return toItem(row);
  }

  async remove(user: AuthUser, id: string): Promise<{ id: string }> {
    const existing = await this.prisma.cropPhenology.findFirst({
      where: { id, tenantId: user.tenantId }, select: { id: true },
    });
    if (!existing) throw new ForbiddenException('物候阶段不在可操作范围内');
    await this.prisma.cropPhenology.delete({ where: { id } });
    return { id };
  }

  // 偏离引擎:遍历调用方作用域内批次,实际累计天数对比该作物标准全周期。
  async deviations(user: AuthUser): Promise<BatchDeviation[]> {
    const batchWhere = await this.scope.ownedScopeWhere(this.prisma, user);
    const batches = await this.prisma.batch.findMany({
      where: batchWhere,
      select: { id: true, batchNo: true, cropName: true, status: true, plantDate: true },
    });
    if (batches.length === 0) return [];
    // 预聚合每作物标准全周期累计天数(各阶段 expectedDays 求和)。
    const phenologies = (await this.prisma.cropPhenology.findMany({
      where: { tenantId: user.tenantId },
      select: { cropName: true, expectedDays: true },
    })) as Array<{ cropName: string; expectedDays: number }>;
    const totalByCrop = new Map<string, number>();
    for (const p of phenologies) {
      totalByCrop.set(p.cropName, (totalByCrop.get(p.cropName) ?? 0) + p.expectedDays);
    }
    const now = Date.now();
    const DAY = 86400000;
    return batches.map((b: any) => {
      const elapsedDays = Math.max(0, Math.floor((now - new Date(b.plantDate).getTime()) / DAY));
      const expectedTotalDays = totalByCrop.has(b.cropName) ? (totalByCrop.get(b.cropName) as number) : null;
      const noBaseline = expectedTotalDays == null;
      const deviationDays = noBaseline ? null : elapsedDays - (expectedTotalDays as number);
      const alert = !noBaseline
        && !TERMINAL_STATUSES.has(b.status)
        && (deviationDays as number) > DEVIATION_THRESHOLD_DAYS;
      return {
        batchId: b.id, batchNo: b.batchNo, cropName: b.cropName, status: b.status,
        plantDate: new Date(b.plantDate).toISOString(),
        elapsedDays, expectedTotalDays, deviationDays, noBaseline, alert,
      };
    });
  }
}
