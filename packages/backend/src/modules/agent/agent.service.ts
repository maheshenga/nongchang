import { Injectable, ForbiddenException, Optional } from '@nestjs/common';
import { AuthUser, CreateAgentDto, UpdateAgentDto, ListQuery, Paginated } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import { PublicTraceCacheService } from '../public-trace/public-trace-cache.service';
import {
  AGENT_LIST_SELECT,
  MERCHANT_LIST_SELECT,
  buildAgentCreateData,
  buildAgentListItem,
  buildAgentListWhere,
  buildAgentSessionRevocationWhere,
  buildAgentStatusUpdateData,
  buildAgentUpdateData,
  buildMerchantListWhere,
  buildPagination,
} from './agent.model';

@Injectable()
export class AgentService {
  constructor(
    private prisma: PrismaService,
    private scope: ScopeService,
    @Optional() private cache?: PublicTraceCacheService,
  ) {}

  async create(user: AuthUser, dto: CreateAgentDto) {
    const created = await this.prisma.agent.create({ data: buildAgentCreateData(user, dto) });
    this.cache?.invalidateTenant(user.tenantId);
    return created;
  }

  async list(user: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where = buildAgentListWhere(user);
    const pagination = buildPagination(query);
    if (pagination.paginated) {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.agent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          select: AGENT_LIST_SELECT,
          skip: pagination.skip,
          take: pagination.take,
        }),
        this.prisma.agent.count({ where }),
      ]);
      return { items: rows.map(buildAgentListItem), total, page: pagination.page, pageSize: pagination.pageSize };
    }
    const rows = await this.prisma.agent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: AGENT_LIST_SELECT,
      take: pagination.take,
    });
    return rows.map(buildAgentListItem);
  }

  async update(user: AuthUser, id: string, dto: UpdateAgentDto) {
    if (!id) throw new ForbiddenException('缺少代理商 id');
    const target = await this.prisma.agent.findFirst({ where: { tenantId: user.tenantId, id } });
    if (!target) throw new ForbiddenException('代理商不存在或不在可管理范围');
    const data = buildAgentUpdateData(dto);
    const updated = await this.prisma.agent.update({ where: { id }, data, select: { id: true, name: true, region: true, status: true } });
    this.cache?.invalidateTenant(user.tenantId);
    return updated;
  }

  async setStatus(user: AuthUser, id: string, status: 'active' | 'suspended') {
    if (!id) throw new ForbiddenException('缺少代理商 id');
    const target = await this.prisma.agent.findFirst({ where: { tenantId: user.tenantId, id } });
    if (!target) throw new ForbiddenException('代理商不存在或不在可管理范围');
    const updateAgent = this.prisma.agent.update({ where: { id }, data: buildAgentStatusUpdateData(status), select: { id: true, status: true } });
    const updated = status !== 'suspended'
      ? await updateAgent
      : (await this.prisma.$transaction([
          updateAgent,
          this.prisma.user.updateMany({
            where: buildAgentSessionRevocationWhere(user, id),
            data: { sessionVersion: { increment: 1 } },
          }),
        ]))[0];
    this.cache?.invalidateTenant(user.tenantId);
    return updated;
  }

  listMerchants(user: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where = buildMerchantListWhere(user);
    if (!where) throw new ForbiddenException('代理管理员缺少 agentId,拒绝访问');
    const pagination = buildPagination(query);
    if (pagination.paginated) {
      return this.prisma.$transaction([
        this.prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: pagination.skip,
          take: pagination.take,
          select: MERCHANT_LIST_SELECT,
        }),
        this.prisma.user.count({ where }),
      ]).then(([items, total]) => ({ items, total, page: pagination.page, pageSize: pagination.pageSize }));
    }
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: pagination.take,
      select: MERCHANT_LIST_SELECT,
    });
  }
}
