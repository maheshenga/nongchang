import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser, Role } from '@nongchang/shared';

@Injectable()
export class ScopeService {
  /** 用于按归属过滤业务表(fields/batches 等带 ownerId/agentId 的表)。
   *  安全关键:角色要求的归属 id 缺失时 fail-closed 抛错,绝不退化为整租户可见。 */
  ownedWhere(user: AuthUser): Record<string, string> {
    const where: Record<string, string> = { tenantId: user.tenantId };
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId,拒绝越权范围查询');
      where.agentId = user.agentId;
    }
    if (user.role === Role.MERCHANT) {
      if (!user.ownerId) throw new ForbiddenException('merchant 缺少 ownerId,拒绝越权范围查询');
      where.ownerId = user.ownerId;
    }
    return where;
  }
}
