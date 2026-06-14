import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser, UserGroupInput, UserGroupView, AssignUserGroupInput } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';

interface UserGroupRow {
  id: string;
  tenantId: string;
  name: string;
  isDefault: boolean;
  permissions: unknown;
  createdAt: Date;
}

@Injectable()
export class UserGroupService {
  constructor(private prisma: PrismaService) {}

  private toView(r: UserGroupRow): UserGroupView {
    return {
      id: r.id,
      name: r.name,
      isDefault: r.isDefault,
      permissions: Array.isArray(r.permissions) ? (r.permissions as string[]) : [],
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    };
  }

  async list(user: AuthUser): Promise<UserGroupView[]> {
    const rows = (await this.prisma.userGroup.findMany({
      where: { tenantId: user.tenantId },
    })) as UserGroupRow[];
    return rows.map(r => this.toView(r));
  }

  async create(user: AuthUser, dto: UserGroupInput): Promise<UserGroupView> {
    if (dto.isDefault) {
      await this.prisma.userGroup.updateMany({
        where: { tenantId: user.tenantId },
        data: { isDefault: false },
      });
    }
    const row = (await this.prisma.userGroup.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        isDefault: dto.isDefault ?? false,
        permissions: dto.permissions ?? [],
      },
    })) as UserGroupRow;
    return this.toView(row);
  }

  async update(user: AuthUser, id: string, dto: UserGroupInput): Promise<UserGroupView> {
    const existing = (await this.prisma.userGroup.findFirst({
      where: { id, tenantId: user.tenantId },
    })) as UserGroupRow | null;
    if (!existing) throw new NotFoundException('用户组不存在');

    if (dto.isDefault) {
      await this.prisma.userGroup.updateMany({
        where: { tenantId: user.tenantId },
        data: { isDefault: false },
      });
    }
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;
    if (dto.permissions !== undefined) data.permissions = dto.permissions;

    const row = (await this.prisma.userGroup.update({
      where: { id },
      data,
    })) as UserGroupRow;
    return this.toView(row);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const existing = (await this.prisma.userGroup.findFirst({
      where: { id, tenantId: user.tenantId },
    })) as UserGroupRow | null;
    if (!existing) throw new NotFoundException('用户组不存在');
    await this.prisma.userGroup.delete({ where: { id } });
  }

  // 微信自动注册时取租户默认组,没有则创建
  async ensureDefault(tenantId: string): Promise<UserGroupView> {
    const existing = (await this.prisma.userGroup.findFirst({
      where: { tenantId, isDefault: true },
    })) as UserGroupRow | null;
    if (existing) return this.toView(existing);
    const row = (await this.prisma.userGroup.create({
      data: { tenantId, name: '默认用户组', isDefault: true, permissions: [] },
    })) as UserGroupRow;
    return this.toView(row);
  }

  async assignUserGroup(user: AuthUser, dto: AssignUserGroupInput): Promise<void> {
    const target = await this.prisma.user.findFirst({
      where: { id: dto.userId, tenantId: user.tenantId },
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
  }
}
