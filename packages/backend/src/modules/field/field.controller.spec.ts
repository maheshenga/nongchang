import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Permission, Role } from '@nongchang/shared';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { FieldController } from './field.controller';

describe('FieldController authorization metadata', () => {
  it('requires field:view permission and explicit supported roles for listing fields', () => {
    const handler = FieldController.prototype.list;

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([Permission.FIELD_VIEW]);
  });
});
