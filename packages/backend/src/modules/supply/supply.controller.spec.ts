import { describe, expect, it } from 'vitest';
import { Role } from '@nongchang/shared';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { SupplyController } from './supply.controller';

const rolesFor = (methodName: 'create' | 'issue' | 'remove') =>
  Reflect.getMetadata(ROLES_KEY, SupplyController.prototype[methodName]);

describe('SupplyController roles', () => {
  it('keeps create merchant-only because createSupplyInput has no ownerId for admin delegation', () => {
    expect(rolesFor('create')).toEqual([Role.MERCHANT]);
  });

  it('keeps issue merchant-only in the read-only system-admin supply view', () => {
    expect(rolesFor('issue')).toEqual([Role.MERCHANT]);
  });

  it('keeps remove merchant-only in the read-only system-admin supply view', () => {
    expect(rolesFor('remove')).toEqual([Role.MERCHANT]);
  });
});
