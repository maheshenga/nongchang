import { Injectable, ForbiddenException } from '@nestjs/common';
import { AuthUser, CreateAgentDto, UpdateAgentDto, Role } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class AgentService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  create(user: AuthUser, dto: CreateAgentDto) {
    return this.prisma.agent.create({ data: { tenantId: user.tenantId, ...dto } });
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.agent.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, region: true, status: true, createdAt: true,
        _count: { select: { users: true } },
      },
    });
    return rows.map(a => ({
      id: a.id, name: a.name, region: a.region, status: a.status,
      createdAt: a.createdAt.toISOString(), merchantCount: a._count.users,
    }));
  }

  async update(user: AuthUser, id: string, dto: UpdateAgentDto) {
    if (!id) throw new ForbiddenException('缺少代理商 id');
    const target = await this.prisma.agent.findFirst({ where: { tenantId: user.tenantId, id } });
    if (!target) throw new ForbiddenException('代理商不存在或不在可管理范围');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.region !== undefined) data.region = dto.region;
    return this.prisma.agent.update({ where: { id }, data });
  }

  async setStatus(user: AuthUser, id: string, status: 'active' | 'suspended') {
    if (!id) throw new ForbiddenException('缺少代理商 id');
    const target = await this.prisma.agent.findFirst({ where: { tenantId: user.tenantId, id } });
    if (!target) throw new ForbiddenException('代理商不存在或不在可管理范围');
    return this.prisma.agent.update({ where: { id }, data: { status } });
  }

  listMerchants(user: AuthUser) {
    const where: Record<string, string> = { tenantId: user.tenantId, role: Role.MERCHANT };
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝访问');
      where.agentId = user.agentId;
    }
    return this.prisma.user.findMany({ where });
  }
}
