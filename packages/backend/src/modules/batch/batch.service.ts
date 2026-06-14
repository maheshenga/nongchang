import { Injectable } from '@nestjs/common';
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
}
