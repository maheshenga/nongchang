import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@nongchang/shared';
import type { Permission } from './permissions';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PrismaService } from '../../prisma/prisma.service';

// 叠加式权限判定:
//   1. 无 @RequirePermission → 放行(交给现有 RolesGuard / 业务校验)
//   2. 管理角色(system_admin / agent_admin)走 role 底座直接放行
//   3. 其它角色(merchant 等)→ 需其 UserGroup.permissions 含该权限点
// 该 Guard 仅作用于显式标注 @RequirePermission 的端点,不影响旧端点。
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!required) return true;

    const user = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('未认证');

    // 管理角色底座放行,无需查组
    if (user.role === Role.SYSTEM_ADMIN || user.role === Role.AGENT_ADMIN) return true;

    const row = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { group: { select: { permissions: true } } },
    });
    const perms = Array.isArray(row?.group?.permissions) ? (row!.group!.permissions as string[]) : [];
    if (!perms.includes(required)) throw new ForbiddenException('无权访问该功能');
    return true;
  }
}
