import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, CreateBatchDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

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
    return this.prisma.batch.findMany({ where });
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
