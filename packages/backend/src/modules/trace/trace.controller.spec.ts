import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Permission, Role } from '@nongchang/shared';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { TraceController } from './trace.controller';

describe('TraceController authorization metadata', () => {
  const readRoles = [Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT];

  it.each(['listCodes', 'listEvents'] as const)(
    'requires trace:view permission and explicit supported roles for %s',
    (methodName) => {
      const handler = TraceController.prototype[methodName];

      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(readRoles);
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([Permission.TRACE_VIEW]);
    },
  );

  it.each(['genCode', 'addEvent'] as const)('does not require explicit permissions for %s in this phase', (methodName) => {
    const handler = TraceController.prototype[methodName];

    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toBeUndefined();
  });
});
