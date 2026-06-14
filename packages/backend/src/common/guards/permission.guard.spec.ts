import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { Role } from '@nongchang/shared';

function ctx(user: any) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

function reflectorReturning(permission: string | undefined) {
  return { getAllAndOverride: (key: string) => (key === PERMISSION_KEY ? permission : undefined) } as any;
}

function prismaWithGroup(permissions: string[] | null) {
  return {
    user: {
      findUnique: async () => (permissions === null ? { group: null } : { group: { permissions } }),
    },
  } as any;
}

describe('PermissionGuard', () => {
  it('无 @RequirePermission 直接放行', async () => {
    const g = new PermissionGuard(reflectorReturning(undefined), prismaWithGroup([]));
    expect(await g.canActivate(ctx({ userId: 'u', role: Role.MERCHANT }))).toBe(true);
  });

  it('system_admin 角色底座直接放行(无需查组)', async () => {
    const g = new PermissionGuard(reflectorReturning('record:create'), prismaWithGroup(null));
    expect(await g.canActivate(ctx({ userId: 'u', role: Role.SYSTEM_ADMIN }))).toBe(true);
  });

  it('agent_admin 角色底座直接放行', async () => {
    const g = new PermissionGuard(reflectorReturning('record:create'), prismaWithGroup(null));
    expect(await g.canActivate(ctx({ userId: 'u', role: Role.AGENT_ADMIN }))).toBe(true);
  });

  it('merchant 且用户组含权限点 → 放行', async () => {
    const g = new PermissionGuard(reflectorReturning('record:create'), prismaWithGroup(['record:create']));
    expect(await g.canActivate(ctx({ userId: 'u', role: Role.MERCHANT }))).toBe(true);
  });

  it('merchant 且用户组缺权限点 → 拒绝', async () => {
    const g = new PermissionGuard(reflectorReturning('record:create'), prismaWithGroup(['trace:view']));
    await expect(g.canActivate(ctx({ userId: 'u', role: Role.MERCHANT }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('merchant 且无用户组 → 拒绝', async () => {
    const g = new PermissionGuard(reflectorReturning('record:create'), prismaWithGroup(null));
    await expect(g.canActivate(ctx({ userId: 'u', role: Role.MERCHANT }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
