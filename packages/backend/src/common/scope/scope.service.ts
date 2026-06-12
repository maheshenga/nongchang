import { Injectable } from '@nestjs/common';
import { AuthUser, Role } from '@nongchang/shared';

@Injectable()
export class ScopeService {
  /** 用于按归属过滤业务表(fields/batches 等带 ownerId/agentId 的表)。 */
  ownedWhere(user: AuthUser): Record<string, string> {
    const where: Record<string, string> = { tenantId: user.tenantId };
    if (user.role === Role.AGENT_ADMIN && user.agentId) where.agentId = user.agentId;
    if (user.role === Role.MERCHANT && user.ownerId) where.ownerId = user.ownerId;
    return where;
  }
}
