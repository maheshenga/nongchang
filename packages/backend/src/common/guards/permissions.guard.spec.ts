import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { Permission, Role } from '@nongchang/shared';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

function contextWith(user: Record<string, unknown>, required: string[]) {
  const handler = () => undefined;
  Reflect.defineMetadata(PERMISSIONS_KEY, required, handler);
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

function makeGuard(row: unknown) {
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(row),
    },
  } as any;
  return { guard: new PermissionsGuard(new Reflector(), prisma), prisma };
}

describe('PermissionsGuard', () => {
  it('allows routes with no permission metadata without querying Prisma', async () => {
    const { guard, prisma } = makeGuard(null);
    const handler = () => undefined;
    const context = {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => ({ user: undefined }) }),
    } as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it.each([Role.PLATFORM_ADMIN, Role.SYSTEM_ADMIN, Role.AGENT_ADMIN])(
    'bypasses group permissions for %s without querying Prisma',
    async (role) => {
      const { guard, prisma } = makeGuard(null);

      await expect(
        guard.canActivate(contextWith({ userId: 'admin-1', tenantId: 't1', role }, [Permission.RECORD_CREATE])),
      ).resolves.toBe(true);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    },
  );

  it('allows a merchant whose group contains all required permissions', async () => {
    const { guard, prisma } = makeGuard({ group: { permissions: [Permission.RECORD_CREATE, Permission.RECORD_VIEW] } });

    await expect(
      guard.canActivate(contextWith({ userId: 'u1', tenantId: 't1', role: Role.MERCHANT }, [Permission.RECORD_CREATE])),
    ).resolves.toBe(true);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'u1', tenantId: 't1' },
      select: { group: { select: { permissions: true } } },
    });
  });

  it('rejects a merchant missing the required group permission', async () => {
    const { guard } = makeGuard({ group: { permissions: [Permission.RECORD_VIEW] } });

    await expect(
      guard.canActivate(contextWith({ userId: 'u1', tenantId: 't1', role: Role.MERCHANT }, [Permission.RECORD_CREATE])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when the user has no group or malformed permissions', async () => {
    const noGroup = makeGuard({ group: null });
    await expect(
      noGroup.guard.canActivate(contextWith({ userId: 'u1', tenantId: 't1', role: Role.MERCHANT }, [Permission.RECORD_CREATE])),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const malformed = makeGuard({ group: { permissions: { bad: true } } });
    await expect(
      malformed.guard.canActivate(contextWith({ userId: 'u1', tenantId: 't1', role: Role.MERCHANT }, [Permission.RECORD_CREATE])),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const partiallyMalformed = makeGuard({ group: { permissions: [Permission.RECORD_CREATE, { bad: true }] } });
    await expect(
      partiallyMalformed.guard.canActivate(contextWith({ userId: 'u1', tenantId: 't1', role: Role.MERCHANT }, [Permission.RECORD_CREATE])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
