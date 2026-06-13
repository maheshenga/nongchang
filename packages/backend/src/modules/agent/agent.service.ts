import { Injectable } from '@nestjs/common';
import { AuthUser, CreateAgentDto, Role } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class AgentService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  create(user: AuthUser, dto: CreateAgentDto) {
    return this.prisma.agent.create({ data: { tenantId: user.tenantId, ...dto } });
  }

  list(user: AuthUser) {
    return this.prisma.agent.findMany({ where: { tenantId: user.tenantId } });
  }

  listMerchants(user: AuthUser) {
    const where: Record<string, string> = { tenantId: user.tenantId, role: Role.MERCHANT };
    if (user.role === Role.AGENT_ADMIN && user.agentId) where.agentId = user.agentId;
    return this.prisma.user.findMany({ where });
  }
}
