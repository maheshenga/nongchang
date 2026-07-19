import { describe, expect, it } from 'vitest';
import { Role } from '../enums';
import { createUserSchema, merchantListItemSchema } from './entities.dto';

const groupId = '00000000-0000-0000-0000-000000000031';

describe('user group entity contracts', () => {
  it('accepts an optional UUID groupId when creating a grouped user', () => {
    expect(createUserSchema.parse({
      username: 'merchant31',
      role: Role.MERCHANT,
      displayName: 'Merchant 31',
      groupId,
    }).groupId).toBe(groupId);
  });

  it('rejects a malformed create-user groupId', () => {
    expect(createUserSchema.safeParse({
      username: 'merchant32',
      role: Role.MERCHANT,
      displayName: 'Merchant 32',
      groupId: 'not-a-uuid',
    }).success).toBe(false);
  });

  it('parses additive merchant group identity without permissions', () => {
    const parsed = merchantListItemSchema.parse({
      id: 'merchant-31',
      username: 'merchant31',
      displayName: 'Merchant 31',
      phone: null,
      status: 'active',
      agentId: null,
      groupId,
      groupName: 'Default user group',
      createdAt: '2026-07-20T00:00:00.000Z',
      fieldCount: 0,
      totalArea: 0,
    });

    expect(parsed).toMatchObject({ groupId, groupName: 'Default user group' });
    expect(parsed).not.toHaveProperty('permissions');
  });
});
