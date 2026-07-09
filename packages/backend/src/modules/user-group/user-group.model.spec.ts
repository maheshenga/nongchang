import { describe, expect, it } from 'vitest';
import { Role, type AuthUser } from '@nongchang/shared';
import {
  buildAssignUserScope,
  buildDefaultUserGroupCreateData,
  buildUserGroupCreateData,
  buildUserGroupTenantWhere,
  buildUserGroupUpdateData,
  buildUserGroupView,
  type UserGroupRow,
} from './user-group.model';

const row: UserGroupRow = {
  id: 'g1',
  tenantId: 't1',
  name: '默认农户',
  isDefault: true,
  permissions: ['record:create'],
  createdAt: new Date('2026-06-14T10:00:00.000Z'),
};

const systemUser: AuthUser = { userId: 'u1', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const agentUser: AuthUser = { userId: 'u2', tenantId: 't1', role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null };

describe('user-group.model', () => {
  it('serializes group rows to the shared view contract', () => {
    expect(buildUserGroupView(row)).toEqual({
      id: 'g1',
      name: '默认农户',
      isDefault: true,
      permissions: ['record:create'],
      createdAt: '2026-06-14T10:00:00.000Z',
    });
    expect(buildUserGroupView({ ...row, permissions: null }).permissions).toEqual([]);
  });

  it('builds create/default/update data', () => {
    expect(buildUserGroupCreateData({ tenantId: 't1', dto: { name: '农户', permissions: ['field:view'] } })).toEqual({
      tenantId: 't1',
      name: '农户',
      isDefault: false,
      permissions: ['field:view'],
    });
    expect(buildDefaultUserGroupCreateData({ tenantId: 't1', permissions: ['record:view'] })).toEqual({
      tenantId: 't1',
      name: '默认用户组',
      isDefault: true,
      permissions: ['record:view'],
    });
    expect(buildUserGroupUpdateData({ name: 'A2', permissions: ['trace:view'] })).toEqual({
      name: 'A2',
      permissions: ['trace:view'],
    });
  });

  it('builds tenant where without dropping empty ids', () => {
    expect(buildUserGroupTenantWhere({ tenantId: 't1' })).toEqual({ tenantId: 't1' });
    expect(buildUserGroupTenantWhere({ tenantId: 't1', id: '' })).toEqual({ tenantId: 't1', id: '' });
    expect(buildUserGroupTenantWhere({ tenantId: 't1', isDefault: true })).toEqual({ tenantId: 't1', isDefault: true });
  });

  it('builds assignment scope without owning service exceptions', () => {
    expect(buildAssignUserScope(systemUser)).toEqual({ tenantId: 't1' });
    expect(buildAssignUserScope(agentUser)).toEqual({ tenantId: 't1', agentId: 'a1' });
    expect(buildAssignUserScope({ ...agentUser, agentId: null })).toEqual({ tenantId: 't1' });
  });
});
