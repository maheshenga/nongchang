import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, CreateFarmRecordDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class FarmRecordService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  create(user: AuthUser, dto: CreateFarmRecordDto) {
    return this.prisma.farmRecord.create({
      data: {
        tenantId: user.tenantId, batchId: dto.batchId, fieldId: dto.fieldId,
        operatorId: user.userId, action: dto.action,
        detail: (dto.detail ?? undefined) as Prisma.InputJsonValue | undefined,
        images: (dto.images ?? undefined) as Prisma.InputJsonValue | undefined,
        location: dto.location ?? null, recordedAt: new Date(dto.recordedAt), source: dto.source,
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
