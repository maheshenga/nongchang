import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Permission, Role } from '@nongchang/shared';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { FarmRecordController } from './farm-record.controller';

describe('FarmRecordController authorization metadata', () => {
  it('requires record:create permission for creating farm records', () => {
    const handler = FarmRecordController.prototype.create;

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Role.SYSTEM_ADMIN, Role.MERCHANT]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([Permission.RECORD_CREATE]);
  });

  it('requires record:view permission and explicit supported roles for listing farm records', () => {
    const handler = FarmRecordController.prototype.list;

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([Permission.RECORD_VIEW]);
  });
});
