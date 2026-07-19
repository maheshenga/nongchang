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

  /** 带 owner 关系的业务实体范围 where。agent_admin 通过关系条件过滤，避免先展开 merchant ids。 */
  ownedEntityWhere(user: AuthUser): Record<string, unknown> {
    const where: Record<string, unknown> = { tenantId: user.tenantId };
    if (user.role === Role.SYSTEM_ADMIN) return where;
    if (user.role === Role.MERCHANT) {
      if (!user.ownerId) throw new ForbiddenException('merchant 缺少 ownerId,拒绝越权范围查询');
      where.ownerId = user.ownerId;
      return where;
    }
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId,拒绝越权范围查询');
      where.owner = {
        is: {
          tenantId: user.tenantId,
          agentId: user.agentId,
          role: Role.MERCHANT,
        },
      };
      return where;
    }
    throw new ForbiddenException('未知角色,拒绝范围查询');
  }

  /** 校验某 batch/field 在调用方作用域内。缺归属即 fail-closed。 */
  async assertInScope(prisma: any, user: AuthUser, entity: 'batch' | 'field', id: string): Promise<void> {
    if (!id) throw new ForbiddenException(`缺少 ${entity} id,拒绝操作`);
    const scopeWhere = this.ownedEntityWhere(user);
    const found = await prisma[entity].findFirst({
      where: { id, ...scopeWhere }, select: { id: true },
    });
    if (!found) throw new ForbiddenException(`${entity} 不在可操作范围内`);
  }

  /** 校验目标 ownerId(role=merchant 的 User)在调用方作用域内。 */
  async assertOwnerInScope(prisma: any, user: AuthUser, ownerId: string): Promise<void> {
    if (!ownerId) throw new ForbiddenException('缺少目标商家 ownerId,拒绝操作');
    const where: Record<string, unknown> = {
      id: ownerId,
      role: Role.MERCHANT,
      tenantId: user.tenantId,
    };
    if (user.role === Role.MERCHANT) {
      if (!user.ownerId || user.ownerId !== ownerId) {
        throw new ForbiddenException('目标商家不在可管理范围内');
      }
    } else if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId,拒绝越权范围查询');
      where.agentId = user.agentId;
    } else if (user.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('未知角色,拒绝范围查询');
    }
    const found = await prisma.user.findFirst({
      where,
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
