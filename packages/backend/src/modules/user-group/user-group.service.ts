import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { AuthUser, UserGroupInput, UserGroupView, AssignUserGroupInput } from '@nongchang/shared';
import { Role } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionValidationCacheService } from '../../auth/session-validation-cache.service';
import { DEFAULT_USER_GROUP_PERMISSIONS } from './default-permissions';
import {
  buildAssignUserScope,
  buildDefaultUserGroupCreateData,
  buildUserGroupCreateData,
  buildUserGroupTenantWhere,
  buildUserGroupUpdateData,
  buildUserGroupView,
  type UserGroupRow,
} from './user-group.model';

@Injectable()
export class UserGroupService {
  constructor(
    private prisma: PrismaService,
    @Optional() private sessions?: SessionValidationCacheService,
  ) {}

  async list(user: AuthUser): Promise<UserGroupView[]> {
    const rows = (await this.prisma.userGroup.findMany({
      where: buildUserGroupTenantWhere({ tenantId: user.tenantId }),
    })) as UserGroupRow[];
    return rows.map(buildUserGroupView);
  }

  async create(user: AuthUser, dto: UserGroupInput): Promise<UserGroupView> {
    const data = buildUserGroupCreateData({ tenantId: user.tenantId, dto });
    const row = dto.isDefault
      ? await this.prisma.$transaction(async (tx) => {
          await tx.userGroup.updateMany({
            where: { tenantId: user.tenantId },
            data: { isDefault: false },
          });
          return tx.userGroup.create({ data });
        })
      : await this.prisma.userGroup.create({ data });
    return buildUserGroupView(row);
  }

  async update(user: AuthUser, id: string, dto: UserGroupInput): Promise<UserGroupView> {
    const existing = (await this.prisma.userGroup.findFirst({
      where: buildUserGroupTenantWhere({ tenantId: user.tenantId, id }),
    })) as UserGroupRow | null;
    if (!existing) throw new NotFoundException('用户组不存在');

    const data = buildUserGroupUpdateData(dto);
    const row = dto.isDefault
      ? await this.prisma.$transaction(async (tx) => {
          await tx.userGroup.updateMany({
            where: { tenantId: user.tenantId },
            data: { isDefault: false },
          });
          return tx.userGroup.update({ where: { id }, data });
        })
      : await this.prisma.userGroup.update({ where: { id }, data });
    return buildUserGroupView(row);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const existing = (await this.prisma.userGroup.findFirst({
      where: buildUserGroupTenantWhere({ tenantId: user.tenantId, id }),
    })) as UserGroupRow | null;
    if (!existing) throw new NotFoundException('用户组不存在');
    await this.prisma.userGroup.delete({ where: { id } });
  }

  // 微信自动注册时取租户默认组,没有则创建
  async ensureDefault(tenantId: string): Promise<UserGroupView> {
    const existing = (await this.prisma.userGroup.findFirst({
      where: buildUserGroupTenantWhere({ tenantId, isDefault: true }),
    })) as UserGroupRow | null;
    if (existing) return buildUserGroupView(existing);
    try {
      const row = (await this.prisma.userGroup.create({
        data: buildDefaultUserGroupCreateData({ tenantId, permissions: DEFAULT_USER_GROUP_PERMISSIONS }),
      })) as UserGroupRow;
      return buildUserGroupView(row);
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const winner = (await this.prisma.userGroup.findFirst({
        where: buildUserGroupTenantWhere({ tenantId, isDefault: true }),
      })) as UserGroupRow | null;
      if (!winner) throw error;
      return buildUserGroupView(winner);
    }
  }

  async resolveForCreate(tenantId: string, requestedGroupId?: string): Promise<string> {
    if (!requestedGroupId) return (await this.ensureDefault(tenantId)).id;
    const group = await this.prisma.userGroup.findFirst({
      where: buildUserGroupTenantWhere({ tenantId, id: requestedGroupId }),
      select: { id: true },
    });
    if (!group) throw new NotFoundException('用户组不存在');
    return group.id;
  }

  async assignUserGroup(user: AuthUser, dto: AssignUserGroupInput): Promise<void> {
    // 范围收敛:agent_admin 仅可给本代理商旗下用户改组,防止跨范围越权。
    if (user.role === Role.AGENT_ADMIN && !user.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝操作');
    const scope = buildAssignUserScope(user);
    const target = await this.prisma.user.findFirst({
      where: { ...scope, id: dto.userId },
    });
    if (!target) throw new NotFoundException('用户不存在');
    if (dto.groupId) {
      const grp = (await this.prisma.userGroup.findFirst({
        where: { id: dto.groupId, tenantId: user.tenantId },
      })) as UserGroupRow | null;
      if (!grp) throw new NotFoundException('用户组不存在');
    }
    await this.prisma.user.update({
      where: { id: dto.userId },
      data: { groupId: dto.groupId },
    });
    await this.sessions?.invalidateUser(user.tenantId, dto.userId);
  }
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: string }).code === 'P2002';
}
