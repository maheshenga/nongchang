import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser, Role } from '@nongchang/shared';

@Injectable()
export class ScopeService {
  /** 用于按归属过滤业务表(fields/batches 等带 ownerId/agentId 的表)。
   *  安全关键:角色要求的归属 id 缺失时 fail-closed 抛错,绝不退化为整租户可见。 */
  ownedWhere(user: AuthUser): Record<string, string> {
    const where: Record<string, string> = { tenantId: user.tenantId };
    if (user.role === Role.SYSTEM_ADMIN) return where;
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId,拒绝越权范围查询');
      where.agentId = user.agentId;
      return where;
    }
    if (user.role === Role.MERCHANT) {
      if (!user.ownerId) throw new ForbiddenException('merchant 缺少 ownerId,拒绝越权范围查询');
      where.ownerId = user.ownerId;
      return where;
    }
    throw new ForbiddenException('未知角色,拒绝范围查询');
  }

  async merchantIdsForAgent(prisma: any, tenantId: string, agentId: string): Promise<string[]> {
    const rows = await prisma.user.findMany({
      where: { tenantId, role: 'merchant', agentId }, select: { id: true },
    });
    return rows.map((r: { id: string }) => r.id);
  }

  /** 业务表(带 ownerId)的范围 where。agent_admin 按旗下 merchant ids 过滤。 */
  async ownedScopeWhere(prisma: any, user: AuthUser): Promise<Record<string, unknown>> {
    const where: Record<string, unknown> = { tenantId: user.tenantId };
    if (user.role === Role.MERCHANT && user.ownerId) where.ownerId = user.ownerId;
    if (user.role === Role.AGENT_ADMIN && user.agentId) {
      const ids = await this.merchantIdsForAgent(prisma, user.tenantId, user.agentId);
      where.ownerId = { in: ids };
    }
    return where;
  }
}
