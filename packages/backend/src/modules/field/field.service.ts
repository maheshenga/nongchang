import { Injectable } from '@nestjs/common';
import { AuthUser, CreateFieldDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class FieldService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  async create(user: AuthUser, dto: CreateFieldDto) {
    const { lng, lat, ...rest } = dto;
    const ownerId = await this.scope.resolveOwnerId(this.prisma, user, rest.ownerId);
    const field = await this.prisma.field.create({
      data: { tenantId: user.tenantId, name: rest.name, area: rest.area,
        ownerId, iotDeviceId: rest.iotDeviceId ?? null },
    });
    await this.prisma.$executeRawUnsafe(
      `UPDATE fields SET location = ST_SetSRID(ST_MakePoint($1,$2),4326) WHERE id = $3`,
      lng, lat, field.id,
    );
    return field;
  }

  async list(user: AuthUser) {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    return this.prisma.field.findMany({ where });
  }
}
