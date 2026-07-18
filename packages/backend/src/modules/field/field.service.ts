import { Injectable, Optional } from '@nestjs/common';
import { AuthUser, CreateFieldDto, ListQuery, Paginated } from '@nongchang/shared';
import { isPaginated } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import { PublicTraceCacheService } from '../public-trace/public-trace-cache.service';
import {
  buildFieldCreateData,
  buildFieldIds,
  buildFieldListFindManyArgs,
  buildFieldOwnerIds,
  buildFieldPagination,
  enrichFieldRows,
  type FieldCoordinateRow,
  type FieldOwnerRow,
  type FieldRow,
} from './field.model';

@Injectable()
export class FieldService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
    @Optional() private cache?: PublicTraceCacheService,
  ) {}

  async create(user: AuthUser, dto: CreateFieldDto) {
    const { lng, lat } = dto;
    const ownerId = await this.scope.resolveOwnerId(this.prisma, user, dto.ownerId);
    const field = await this.prisma.field.create({
      data: buildFieldCreateData({ tenantId: user.tenantId, ownerId, dto }),
    });
    await this.prisma.$executeRawUnsafe(
      `UPDATE fields SET location = ST_SetSRID(ST_MakePoint($1,$2),4326) WHERE id = $3`,
      lng, lat, field.id,
    );
    await this.cache?.invalidateTenant(user.tenantId);
    return field;
  }

  // 向后兼容分页:不传 page/pageSize 返回裸数组(带默认安全上限);传了则返回分页信封。
  async list(user: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where = this.scope.ownedEntityWhere(user);
    if (isPaginated(query)) {
      const { page, pageSize } = buildFieldPagination(query);
      const [fields, total] = await this.prisma.$transaction([
        this.prisma.field.findMany(buildFieldListFindManyArgs({ where, page, pageSize })),
        this.prisma.field.count({ where }),
      ]);
      return { items: await this.enrich(fields as FieldRow[]), total, page, pageSize };
    }
    const fields = await this.prisma.field.findMany(buildFieldListFindManyArgs({ where }));
    return this.enrich(fields as FieldRow[]);
  }

  // 给一页 fields 补 ownerName 与经纬度(从 PostGIS location 列提取)。
  private async enrich(fields: FieldRow[]): Promise<any[]> {
    if (fields.length === 0) return [];
    const ownerIds = buildFieldOwnerIds(fields);
    const owners = (await this.prisma.user.findMany({
      where: { id: { in: ownerIds } }, select: { id: true, displayName: true },
    })) as FieldOwnerRow[];
    // 经纬度存 PostGIS geography 列,用 ST_X/ST_Y 从 location 提取(转 geometry 后取坐标)。
    // 注:id 列为 uuid,Prisma 把 JS 字符串数组绑定为 text[],故用 id::text 比较避免 text=uuid 操作符不存在(42883)。
    const ids = buildFieldIds(fields);
    const coords = await this.prisma.$queryRawUnsafe<FieldCoordinateRow[]>(
      `SELECT id, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat FROM fields WHERE id::text = ANY($1)`,
      ids,
    );
    return enrichFieldRows({ fields, owners, coords });
  }
}
