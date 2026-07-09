import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AuthUser, CreateCropPhenologyDto, UpdateCropPhenologyDto, CropPhenologyItem, BatchDeviation,
} from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import {
  buildBatchDeviation,
  buildExpectedDaysByCrop,
  buildPhenologyCreateData,
  buildPhenologyUpdateData,
  toPhenologyItem,
} from './phenology.model';
import type { PhenologyRow } from './phenology.model';

@Injectable()
export class PhenologyService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  // 标准物候模型为租户级公共配置,按 cropName + sortOrder 排序返回。
  async list(user: AuthUser): Promise<CropPhenologyItem[]> {
    const rows = (await this.prisma.cropPhenology.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ cropName: 'asc' }, { sortOrder: 'asc' }],
    })) as PhenologyRow[];
    return rows.map(toPhenologyItem);
  }

  async create(user: AuthUser, dto: CreateCropPhenologyDto): Promise<CropPhenologyItem> {
    const row = (await this.prisma.cropPhenology.create({
      data: buildPhenologyCreateData({ tenantId: user.tenantId, dto }),
    })) as PhenologyRow;
    return toPhenologyItem(row);
  }

  async update(user: AuthUser, id: string, dto: UpdateCropPhenologyDto): Promise<CropPhenologyItem> {
    const existing = await this.prisma.cropPhenology.findFirst({
      where: { id, tenantId: user.tenantId }, select: { id: true },
    });
    if (!existing) throw new ForbiddenException('物候阶段不在可操作范围内');
    const row = (await this.prisma.cropPhenology.update({
      where: { id },
      data: buildPhenologyUpdateData(dto),
    })) as PhenologyRow;
    return toPhenologyItem(row);
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
    const totalByCrop = buildExpectedDaysByCrop(phenologies);
    const nowMs = Date.now();
    return batches.map((batch: any) => buildBatchDeviation(batch, totalByCrop, nowMs));
  }
}
