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

  /** 业务表(带 ownerId)的范围 where。agent_admin 按旗下 merchant ids 过滤。
   *  安全关键:与 ownedWhere 一致,角色要求的归属 id 缺失时 fail-closed 抛错,绝不退化为整租户可见。 */
  async ownedScopeWhere(prisma: any, user: AuthUser): Promise<Record<string, unknown>> {
    const where: Record<string, unknown> = { tenantId: user.tenantId };
    if (user.role === Role.SYSTEM_ADMIN) return where;
    if (user.role === Role.MERCHANT) {
      if (!user.ownerId) throw new ForbiddenException('merchant 缺少 ownerId,拒绝越权范围查询');
      where.ownerId = user.ownerId;
      return where;
    }
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId,拒绝越权范围查询');
      const ids = await this.merchantIdsForAgent(prisma, user.tenantId, user.agentId);
      where.ownerId = { in: ids };
      return where;
    }
    throw new ForbiddenException('未知角色,拒绝范围查询');
  }

  /** 校验某 batch/field 在调用方作用域内。缺归属即 fail-closed(ownedScopeWhere 抛错)。 */
  async assertInScope(prisma: any, user: AuthUser, entity: 'batch' | 'field', id: string): Promise<void> {
    const scopeWhere = await this.ownedScopeWhere(prisma, user);
    const found = await prisma[entity].findFirst({
      where: { id, ...scopeWhere }, select: { id: true },
    });
    if (!found) throw new ForbiddenException(`${entity} 不在可操作范围内`);
  }

  /** 校验目标 ownerId(role=merchant 的 User)在调用方作用域内。 */
  async assertOwnerInScope(prisma: any, user: AuthUser, ownerId: string): Promise<void> {
    const scopeWhere = await this.ownedScopeWhere(prisma, user);
    // ownedScopeWhere 的 ownerId 维度即 User.id;用 AND 数组避免 id 键冲突。
    const { ownerId: ownerConstraint, ...rest } = scopeWhere;
    const found = await prisma.user.findFirst({
      where: {
        AND: [
          { id: ownerId, role: Role.MERCHANT, ...rest },
          ownerConstraint !== undefined ? { id: ownerConstraint } : {},
        ],
      },
      select: { id: true },
    });
    if (!found) throw new ForbiddenException('目标商家不在可管理范围内');
  }

  /** 统一 create 的 ownerId 语义:merchant 强制 self;agent/sysadmin 采纳 dto.ownerId 并校验范围。 */
  async resolveOwnerId(prisma: any, user: AuthUser, dtoOwnerId: string): Promise<string> {
    if (user.role === Role.MERCHANT) {
      if (!user.ownerId) throw new ForbiddenException('merchant 缺少 ownerId,拒绝创建');
      return user.ownerId;
    }
    await this.assertOwnerInScope(prisma, user, dtoOwnerId);
    return dtoOwnerId;
  }
}
