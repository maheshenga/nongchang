import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Permission, Role } from '@nongchang/shared';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { BatchController } from './batch.controller';

describe('BatchController authorization metadata', () => {
  const readRoles = [Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT];

  it.each(['list', 'byCode', 'lifecycle'] as const)(
    'requires batch:view permission and explicit supported roles for %s',
    (methodName) => {
      const handler = BatchController.prototype[methodName];

      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(readRoles);
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([Permission.BATCH_VIEW]);
    },
  );
});
