import { describe, expect, it } from 'vitest';
import { Role } from '@nongchang/shared';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { SupplyController } from './supply.controller';

describe('SupplyController roles', () => {
  it('create is merchant-only because createSupplyInput has no ownerId for admin delegation', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SupplyController.prototype.create);
    expect(roles).toEqual([Role.MERCHANT]);
  });
});
