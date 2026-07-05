import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, Role } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

const BYPASS_ROLES: Role[] = [Role.PLATFORM_ADMIN, Role.SYSTEM_ADMIN, Role.AGENT_ADMIN];

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user;
    if (!user?.userId || !user?.tenantId || !user?.role) throw new ForbiddenException('用户组权限不足');
    if (BYPASS_ROLES.includes(user.role)) return true;

    const row = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { group: { select: { permissions: true } } },
    }) as { group: { permissions: unknown } | null } | null;

    const permissions = row?.group?.permissions;
    if (!Array.isArray(permissions) || permissions.some((p) => typeof p !== 'string')) {
      throw new ForbiddenException('用户组权限不足');
    }

    const granted = permissions as string[];
    const allowed = required.every((permission) => granted.includes(permission));
    if (!allowed) throw new ForbiddenException('用户组权限不足');
    return true;
  }
}
