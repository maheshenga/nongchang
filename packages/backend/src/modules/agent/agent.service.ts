import { Injectable, ForbiddenException } from '@nestjs/common';
import { AuthUser, CreateAgentDto, UpdateAgentDto, Role, ListQuery, Paginated, isPaginated } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

const DEFAULT_LIST_CAP = 500;

@Injectable()
export class AgentService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  create(user: AuthUser, dto: CreateAgentDto) {
    return this.prisma.agent.create({ data: { tenantId: user.tenantId, ...dto } });
  }

  async list(user: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where = { tenantId: user.tenantId };
    const select = {
      id: true, name: true, region: true, status: true, createdAt: true,
      _count: { select: { users: { where: { role: Role.MERCHANT, status: { not: 'pending' } } } } },
    };
    const toItem = (a: any) => ({
      id: a.id, name: a.name, region: a.region, status: a.status,
      createdAt: a.createdAt.toISOString(), merchantCount: a._count.users,
    });
    if (isPaginated(query)) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.agent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          select,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.agent.count({ where }),
      ]);
      return { items: rows.map(toItem), total, page, pageSize };
    }
    const rows = await this.prisma.agent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select,
      take: DEFAULT_LIST_CAP,
    });
    return rows.map(toItem);
  }

  async update(user: AuthUser, id: string, dto: UpdateAgentDto) {
    if (!id) throw new ForbiddenException('缺少代理商 id');
    const target = await this.prisma.agent.findFirst({ where: { tenantId: user.tenantId, id } });
    if (!target) throw new ForbiddenException('代理商不存在或不在可管理范围');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.region !== undefined) data.region = dto.region;
    return this.prisma.agent.update({ where: { id }, data, select: { id: true, name: true, region: true, status: true } });
  }

  async setStatus(user: AuthUser, id: string, status: 'active' | 'suspended') {
    if (!id) throw new ForbiddenException('缺少代理商 id');
    const target = await this.prisma.agent.findFirst({ where: { tenantId: user.tenantId, id } });
    if (!target) throw new ForbiddenException('代理商不存在或不在可管理范围');
    const updateAgent = this.prisma.agent.update({ where: { id }, data: { status }, select: { id: true, status: true } });
    if (status !== 'suspended') return updateAgent;
    const [updated] = await this.prisma.$transaction([
      updateAgent,
      this.prisma.user.updateMany({
        where: { tenantId: user.tenantId, agentId: id },
        data: { sessionVersion: { increment: 1 } },
      }),
    ]);
    return updated;
  }

  listMerchants(user: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where: Record<string, string> = { tenantId: user.tenantId, role: Role.MERCHANT };
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝访问');
      where.agentId = user.agentId;
    }
    const select = { id: true, username: true, role: true, agentId: true, displayName: true };
    if (isPaginated(query)) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      return this.prisma.$transaction([
        this.prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select,
        }),
        this.prisma.user.count({ where }),
      ]).then(([items, total]) => ({ items, total, page, pageSize }));
    }
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: DEFAULT_LIST_CAP,
      select,
    });
  }
}
