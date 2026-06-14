import { Injectable, ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AuthUser, CreateUserDto, ReviewUserInput, UpdateUserDto, Role } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  async create(actor: AuthUser, dto: CreateUserDto) {
    let agentId = dto.agentId ?? null;
    if (actor.role === Role.AGENT_ADMIN) {
      if (dto.role !== Role.MERCHANT) throw new ForbiddenException('代理商只能创建商家账号');
      agentId = actor.agentId;
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

  list(actor: AuthUser) {
    const where = this.scopedWhere(actor);
    return this.prisma.user.findMany({
      where, select: { id: true, username: true, role: true, agentId: true, displayName: true, status: true },
    });
  }

  // 商户管理屏:仅 role=merchant,带地块数/确权面积聚合,排除待审核 pending。
  async listMerchants(actor: AuthUser) {
    const where = { ...this.scopedWhere(actor), role: Role.MERCHANT, status: { not: 'pending' } };
    const merchants = await this.prisma.user.findMany({
      where, orderBy: { createdAt: 'desc' },
      select: { id: true, username: true, displayName: true, phone: true, status: true, agentId: true, createdAt: true },
    });
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
    const target = await this.prisma.user.findFirst({ where: { ...this.scopedWhere(actor), id, role: Role.MERCHANT } });
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
    const target = await this.prisma.user.findFirst({ where: { ...this.scopedWhere(actor), id, role: Role.MERCHANT } });
    if (!target) throw new ForbiddenException('目标用户不存在或不在可管理范围');
    return this.prisma.user.update({
      where: { id }, data: { status },
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

  async listPending(actor: AuthUser) {
    const where = { ...this.scopedWhere(actor), status: 'pending' };
    return this.prisma.user.findMany({
      where, orderBy: { createdAt: 'desc' },
      select: { id: true, displayName: true, phone: true, createdAt: true },
    });
  }

  async review(actor: AuthUser, userId: string, dto: ReviewUserInput) {
    const target = await this.prisma.user.findFirst({
      where: { ...this.scopedWhere(actor), id: userId, status: 'pending' },
    });
    if (!target) throw new ForbiddenException('目标用户不存在或不在可管理范围');
    const status = dto.action === 'approve' ? 'active' : 'rejected';
    await this.prisma.user.update({ where: { id: userId }, data: { status } });
    return { id: userId, status };
  }
}
