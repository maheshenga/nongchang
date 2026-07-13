import { Injectable, ForbiddenException, Optional } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AuthUser, CreateUserDto, ReviewUserInput, UpdateUserDto, ListQuery, Paginated } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import { SessionValidationCacheService } from '../../auth/session-validation-cache.service';
import {
  MerchantFieldAggregateRow,
  MerchantListRow,
  buildMerchantFieldAggregateWhere,
  buildMerchantListFindManyArgs,
  buildMerchantListWhere,
  buildMerchantTargetWhere,
  buildPendingMerchantListFindManyArgs,
  buildPendingMerchantListWhere,
  buildUserListFindManyArgs,
  buildUserListWhere,
  buildUserStatusUpdateData,
  getMerchantIds,
  resolveCreateUserAgentId,
  resolveUserListPagination,
  reviewActionToStatus,
  toMerchantListItems,
  toPaginatedUserList,
} from './user.model';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
    @Optional() private sessions?: SessionValidationCacheService,
  ) {}

  async create(actor: AuthUser, dto: CreateUserDto) {
    const agentId = resolveCreateUserAgentId(actor, dto);
    if (agentId) {
      const agent = await this.prisma.agent.findFirst({
        where: { id: agentId, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!agent) throw new ForbiddenException('Agent does not exist in the current tenant');
    }
    const initialPassword = randomBytes(8).toString('base64url');
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    const created = await this.prisma.user.create({
      data: {
        tenantId: actor.tenantId, role: dto.role, agentId,
        username: dto.username, passwordHash, phone: dto.phone ?? null,
        displayName: dto.displayName,
      },
      select: { id: true, username: true, role: true, agentId: true, displayName: true },
    });
    return { ...created, initialPassword };
  }

  // 向后兼容分页:不传 page/pageSize 返回裸数组(带默认安全上限);传了则返回分页信封。
  async list(actor: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where = buildUserListWhere(actor, query);
    const pagination = resolveUserListPagination(query);
    if (pagination.paginated) {
      const [items, total] = await this.prisma.$transaction([
        this.prisma.user.findMany(buildUserListFindManyArgs(where, query)),
        this.prisma.user.count({ where }),
      ]);
      return toPaginatedUserList(items, total, query);
    }
    return this.prisma.user.findMany(buildUserListFindManyArgs(where, query));
  }

  // 商户管理屏:仅 role=merchant,带地块数/确权面积聚合,排除待审核 pending。
  // 向后兼容分页:不传 page/pageSize 返回裸数组(带默认安全上限);传了则返回分页信封。
  async listMerchants(actor: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where = buildMerchantListWhere(actor, query);
    const pagination = resolveUserListPagination(query);
    let merchants: MerchantListRow[];
    let total: number | null = null;
    if (pagination.paginated) {
      const [rows, count] = await this.prisma.$transaction([
        this.prisma.user.findMany(buildMerchantListFindManyArgs(where, query)),
        this.prisma.user.count({ where }),
      ]);
      merchants = rows as MerchantListRow[];
      total = count;
    } else {
      merchants = await this.prisma.user.findMany(buildMerchantListFindManyArgs(where, query)) as MerchantListRow[];
    }
    const items = await this.enrichMerchants(actor, merchants);
    return total === null ? items : toPaginatedUserList(items, total, query);
  }

  // 给一页 merchants 补地块数(fieldCount)与确权面积(totalArea)。
  private async enrichMerchants(actor: AuthUser, merchants: MerchantListRow[]): Promise<any[]> {
    const aggregateWhere = buildMerchantFieldAggregateWhere(actor.tenantId, getMerchantIds(merchants));
    const aggregates = aggregateWhere
      ? await this.prisma.field.groupBy({
          by: ['ownerId'], where: aggregateWhere,
          _count: { _all: true }, _sum: { area: true },
        })
      : [];
    return toMerchantListItems(merchants, aggregates as MerchantFieldAggregateRow[]);
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    if (!id) throw new ForbiddenException('缺少用户 id');
    const target = await this.prisma.user.findFirst({ where: buildMerchantTargetWhere(actor, id, 'manageable') });
    if (!target) throw new ForbiddenException('目标用户不存在或不在可管理范围');
    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    const updated = await this.prisma.user.update({
      where: { id }, data,
      select: { id: true, username: true, displayName: true, phone: true, status: true },
    });
    await this.sessions?.invalidateUser(actor.tenantId, id);
    return updated;
  }

  async setStatus(actor: AuthUser, id: string, status: 'active' | 'suspended') {
    if (!id) throw new ForbiddenException('缺少用户 id');
    const target = await this.prisma.user.findFirst({ where: buildMerchantTargetWhere(actor, id, 'manageable') });
    if (!target) throw new ForbiddenException('目标用户不存在或不在可管理范围');
    const updated = await this.prisma.user.update({
      where: { id }, data: buildUserStatusUpdateData(status),
      select: { id: true, status: true },
    });
    await this.sessions?.invalidateUser(actor.tenantId, id);
    return updated;
  }

  async listPending(actor: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where = buildPendingMerchantListWhere(actor, query);
    const pagination = resolveUserListPagination(query);
    if (pagination.paginated) {
      const [items, total] = await this.prisma.$transaction([
        this.prisma.user.findMany(buildPendingMerchantListFindManyArgs(where, query)),
        this.prisma.user.count({ where }),
      ]);
      return toPaginatedUserList(items, total, query);
    }
    return this.prisma.user.findMany(buildPendingMerchantListFindManyArgs(where, query));
  }

  async review(actor: AuthUser, userId: string, dto: ReviewUserInput) {
    const target = await this.prisma.user.findFirst({
      where: buildMerchantTargetWhere(actor, userId, 'pending'),
    });
    if (!target) throw new ForbiddenException('目标用户不存在或不在可管理范围');
    const status = reviewActionToStatus(dto.action);
    await this.prisma.user.update({ where: { id: userId }, data: { status } });
    await this.sessions?.invalidateUser(actor.tenantId, userId);
    return { id: userId, status };
  }
}
