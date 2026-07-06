import { Injectable, ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AuthUser, CreateUserDto, ReviewUserInput, UpdateUserDto, Role, ListQuery, Paginated } from '@nongchang/shared';
import { isPaginated } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

// 未分页时的默认安全上限:防无界结果集。
const DEFAULT_LIST_CAP = 500;

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  async create(actor: AuthUser, dto: CreateUserDto) {
    let agentId = dto.role === Role.MEMBER ? null : (dto.agentId ?? null);
    if (actor.role === Role.AGENT_ADMIN) {
      if (dto.role !== Role.MERCHANT) throw new ForbiddenException('代理商只能创建商家账号');
      if (!actor.agentId) throw new ForbiddenException('Agent admin is missing agentId');
      agentId = actor.agentId;
    }
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
    const where = this.scopedWhere(actor);
    const select = { id: true, username: true, role: true, agentId: true, displayName: true, status: true };
    if (isPaginated(query)) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const [items, total] = await this.prisma.$transaction([
        this.prisma.user.findMany({ where, select, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        this.prisma.user.count({ where }),
      ]);
      return { items, total, page, pageSize };
    }
    return this.prisma.user.findMany({ where, select, orderBy: { createdAt: 'desc' }, take: DEFAULT_LIST_CAP });
  }

  // 商户管理屏:仅 role=merchant,带地块数/确权面积聚合,排除待审核 pending。
  // 向后兼容分页:不传 page/pageSize 返回裸数组(带默认安全上限);传了则返回分页信封。
  async listMerchants(actor: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where = { ...this.scopedWhere(actor), role: Role.MERCHANT, status: { not: 'pending' } };
    const select = { id: true, username: true, displayName: true, phone: true, status: true, agentId: true, createdAt: true };
    let merchants: any[];
    let total: number | null = null;
    let page = 1;
    let pageSize = 20;
    if (isPaginated(query)) {
      page = query.page ?? 1;
      pageSize = query.pageSize ?? 20;
      const [rows, count] = await this.prisma.$transaction([
        this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, select, skip: (page - 1) * pageSize, take: pageSize }),
        this.prisma.user.count({ where }),
      ]);
      merchants = rows;
      total = count;
    } else {
      merchants = await this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, select, take: DEFAULT_LIST_CAP });
    }
    const items = await this.enrichMerchants(actor, merchants);
    return total === null ? items : { items, total, page, pageSize };
  }

  // 给一页 merchants 补地块数(fieldCount)与确权面积(totalArea)。
  private async enrichMerchants(actor: AuthUser, merchants: any[]): Promise<any[]> {
    const ids = merchants.map(m => m.id);
    const agg = ids.length
      ? await this.prisma.field.groupBy({
          by: ['ownerId'], where: { tenantId: actor.tenantId, ownerId: { in: ids } },
          _count: { _all: true }, _sum: { area: true },
        })
      : [];
    const byOwner = new Map(agg.map((a: any) => [a.ownerId, a]));
    return merchants.map(m => {
      const a: any = byOwner.get(m.id);
      return {
        id: m.id, username: m.username, displayName: m.displayName,
        phone: m.phone, status: m.status, agentId: m.agentId,
        createdAt: m.createdAt.toISOString(),
        fieldCount: a?._count._all ?? 0,
        totalArea: a?._sum.area ?? 0,
      };
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    if (!id) throw new ForbiddenException('缺少用户 id');
    const target = await this.prisma.user.findFirst({ where: { ...this.scopedWhere(actor), id, role: Role.MERCHANT, status: { not: 'pending' } } });
    if (!target) throw new ForbiddenException('目标用户不存在或不在可管理范围');
    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    return this.prisma.user.update({
      where: { id }, data,
      select: { id: true, username: true, displayName: true, phone: true, status: true },
    });
  }

  async setStatus(actor: AuthUser, id: string, status: 'active' | 'suspended') {
    if (!id) throw new ForbiddenException('缺少用户 id');
    const target = await this.prisma.user.findFirst({ where: { ...this.scopedWhere(actor), id, role: Role.MERCHANT, status: { not: 'pending' } } });
    if (!target) throw new ForbiddenException('目标用户不存在或不在可管理范围');
    const data: Record<string, unknown> = { status };
    if (status === 'suspended') data.sessionVersion = { increment: 1 };
    return this.prisma.user.update({
      where: { id }, data,
      select: { id: true, status: true },
    });
  }

  private scopedWhere(actor: AuthUser): Record<string, string> {
    const where: Record<string, string> = { tenantId: actor.tenantId };
    if (actor.role === Role.AGENT_ADMIN) {
      if (!actor.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝访问');
      where.agentId = actor.agentId;
    }
    return where;
  }

  async listPending(actor: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where = { ...this.scopedWhere(actor), role: Role.MERCHANT, status: 'pending' };
    const select = { id: true, displayName: true, phone: true, createdAt: true };
    if (isPaginated(query)) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const [items, total] = await this.prisma.$transaction([
        this.prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select,
        }),
        this.prisma.user.count({ where }),
      ]);
      return { items, total, page, pageSize };
    }
    return this.prisma.user.findMany({
      where, orderBy: { createdAt: 'desc' },
      take: DEFAULT_LIST_CAP,
      select,
    });
  }

  async review(actor: AuthUser, userId: string, dto: ReviewUserInput) {
    const target = await this.prisma.user.findFirst({
      where: { ...this.scopedWhere(actor), id: userId, role: Role.MERCHANT, status: 'pending' },
    });
    if (!target) throw new ForbiddenException('目标用户不存在或不在可管理范围');
    const status = dto.action === 'approve' ? 'active' : 'rejected';
    await this.prisma.user.update({ where: { id: userId }, data: { status } });
    return { id: userId, status };
  }
}
