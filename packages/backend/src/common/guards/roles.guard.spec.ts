import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { Role } from '@nongchang/shared';
import { RolesGuard } from './roles.guard';

function contextWith(role: Role, required: Role[]) {
  const handler = () => undefined;
  Reflect.defineMetadata('roles', required, handler);
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as any;
}

describe('RolesGuard', () => {
  it('allows platform_admin on platform-only routes', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(contextWith(Role.PLATFORM_ADMIN, [Role.PLATFORM_ADMIN]))).toBe(true);
  });

  it('rejects tenant system_admin on platform-only routes', () => {
    const guard = new RolesGuard(new Reflector());
    expect(() => guard.canActivate(contextWith(Role.SYSTEM_ADMIN, [Role.PLATFORM_ADMIN])))
      .toThrow(ForbiddenException);
  });
});
