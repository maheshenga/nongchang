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
    const fields = await this.prisma.field.findMany({ where });
    if (fields.length === 0) return [];
    const ownerIds = [...new Set(fields.map((f: any) => f.ownerId))];
    const owners = await this.prisma.user.findMany({
      where: { id: { in: ownerIds } }, select: { id: true, displayName: true },
    });
    const nameMap = new Map(owners.map((o: any) => [o.id, o.displayName]));
    // 经纬度存 PostGIS geography 列,用 ST_X/ST_Y 从 location 提取(转 geometry 后取坐标)。
    // 注:id 列为 uuid,Prisma 把 JS 字符串数组绑定为 text[],故用 id::text 比较避免 text=uuid 操作符不存在(42883)。
    const ids = fields.map((f: any) => f.id);
    const coords = await this.prisma.$queryRawUnsafe<Array<{ id: string; lng: number | null; lat: number | null }>>(
      `SELECT id, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat FROM fields WHERE id::text = ANY($1)`,
      ids,
    );
    const coordMap = new Map(coords.map((c) => [c.id, c]));
    return fields.map((f: any) => ({
      ...f,
      ownerName: nameMap.get(f.ownerId) ?? null,
      lng: coordMap.get(f.id)?.lng ?? null,
      lat: coordMap.get(f.id)?.lat ?? null,
    }));
  }
}
