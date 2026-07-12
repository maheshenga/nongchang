import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { Role } from '@nongchang/shared';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { UserGroupController } from './user-group.controller';

const reflector = new Reflector();

function rolesFor(method: keyof UserGroupController): Role[] | undefined {
  return reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
    UserGroupController.prototype[method] as object,
    UserGroupController,
  ]);
}

describe('UserGroupController role boundary', () => {
  it.each(['create', 'update', 'remove'] as const)('reserves %s for system admins', (method) => {
    expect(rolesFor(method)).toEqual([Role.SYSTEM_ADMIN]);
  });

  it.each(['list', 'assign'] as const)('keeps %s available to agent admins', (method) => {
    expect(rolesFor(method)).toEqual([Role.SYSTEM_ADMIN, Role.AGENT_ADMIN]);
  });
});
