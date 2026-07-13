import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import {
  assertCanSetTenantStatus,
  DEFAULT_TENANT_LIST_CAP,
  TENANT_LIST_SELECT,
  buildDefaultTenantGroupCreateData,
  buildTenantAdminCreateData,
  buildTenantCreateData,
  buildTenantListFindManyArgs,
  buildTenantListWhere,
  normalizeTenantCode,
  resolveTenantListPagination,
  toPaginatedTenantList,
  toTenantListItem,
  toTenantListItems,
  toTenantStatusResult,
} from './tenant.model';

const actor = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  userId: 'platform-user',
  tenantId: 'platform-tenant',
  role: Role.PLATFORM_ADMIN,
  agentId: null,
  ownerId: null,
  sessionVersion: 0,
  ...overrides,
});

describe('tenant.model', () => {
  it('normalizes tenant codes by trimming and uppercasing', () => {
    expect(normalizeTenantCode(' new_tenant ')).toBe('NEW_TENANT');
  });

  it('projects tenant list rows with ISO dates and count defaults', () => {
    expect(toTenantListItem({
      id: 't1',
      name: 'Tenant A',
      code: 'TENANT_A',
      status: 'active',
      createdAt: new Date('2026-07-05T00:00:00.000Z'),
    })).toEqual({
      id: 't1',
      name: 'Tenant A',
      code: 'TENANT_A',
      status: 'active',
      createdAt: '2026-07-05T00:00:00.000Z',
      userCount: 0,
      agentCount: 0,
    });
  });

  it('builds capped non-paginated tenant list query args', () => {
    expect(buildTenantListFindManyArgs()).toEqual({
      where: {},
      orderBy: { createdAt: 'desc' },
      select: TENANT_LIST_SELECT,
      skip: 0,
      take: DEFAULT_TENANT_LIST_CAP,
    });
  });

  it('builds paginated tenant list query args', () => {
    expect(resolveTenantListPagination({ page: 3, pageSize: 25 })).toEqual({
      page: 3,
      pageSize: 25,
      skip: 50,
      take: 25,
    });
    expect(buildTenantListFindManyArgs({ page: 3, pageSize: 25 })).toEqual({
      where: {},
      orderBy: { createdAt: 'desc' },
      select: TENANT_LIST_SELECT,
      skip: 50,
      take: 25,
    });
  });

  it('builds tenant name and code search filters', () => {
    const where = {
      OR: [
        { name: { contains: '华东', mode: 'insensitive' } },
        { code: { contains: '华东', mode: 'insensitive' } },
      ],
    };
    expect(buildTenantListWhere({ search: '华东' })).toEqual(where);
    expect(buildTenantListFindManyArgs({ page: 1, pageSize: 50, search: '华东' })).toMatchObject({ where });
  });

  it('projects tenant list rows as bare arrays and paginated envelopes', () => {
    const rows = [
      {
        id: 't1',
        name: 'Tenant A',
        code: 'TENANT_A',
        status: 'active',
        createdAt: new Date('2026-07-05T00:00:00.000Z'),
        _count: { users: 2, agents: 1 },
      },
    ];

    expect(toTenantListItems(rows)).toEqual([
      {
        id: 't1',
        name: 'Tenant A',
        code: 'TENANT_A',
        status: 'active',
        createdAt: '2026-07-05T00:00:00.000Z',
        userCount: 2,
        agentCount: 1,
      },
    ]);
    expect(toPaginatedTenantList(rows, 8, { page: 2, pageSize: 1 })).toEqual({
      items: [
        {
          id: 't1',
          name: 'Tenant A',
          code: 'TENANT_A',
          status: 'active',
          createdAt: '2026-07-05T00:00:00.000Z',
          userCount: 2,
          agentCount: 1,
        },
      ],
      total: 8,
      page: 2,
      pageSize: 1,
    });
  });

  it('builds active tenant create data', () => {
    expect(buildTenantCreateData({
      name: 'New Tenant',
      code: 'new',
      adminUsername: 'admin',
      adminDisplayName: 'Admin',
    }, 'NEW')).toEqual({ name: 'New Tenant', code: 'NEW', status: 'active' });
  });

  it('builds initial tenant admin create data', () => {
    expect(buildTenantAdminCreateData('t1', 'hash1', {
      name: 'Tenant',
      code: 'T',
      adminUsername: 'admin',
      adminDisplayName: 'Tenant Admin',
    })).toEqual({
      tenantId: 't1',
      username: 'admin',
      passwordHash: 'hash1',
      role: Role.SYSTEM_ADMIN,
      displayName: 'Tenant Admin',
      phone: null,
      status: 'active',
    });
  });

  it('preserves optional admin phone in create data', () => {
    expect(buildTenantAdminCreateData('t1', 'hash1', {
      name: 'Tenant',
      code: 'T',
      adminUsername: 'admin',
      adminDisplayName: 'Tenant Admin',
      adminPhone: '13800000000',
    }).phone).toBe('13800000000');
  });

  it('builds default group create data with a copied permissions array', () => {
    const permissions = ['record:create', 'record:view'];
    const data = buildDefaultTenantGroupCreateData('t1', permissions);
    permissions.push('field:view');

    expect(data).toEqual({
      tenantId: 't1',
      name: '默认用户组',
      isDefault: true,
      permissions: ['record:create', 'record:view'],
    });
  });

  it('rejects suspending the actor tenant', () => {
    expect(() => assertCanSetTenantStatus(actor(), 'platform-tenant', 'suspended'))
      .toThrow(ForbiddenException);
  });

  it('allows activating the actor tenant and suspending other tenants', () => {
    expect(() => assertCanSetTenantStatus(actor(), 'platform-tenant', 'active')).not.toThrow();
    expect(() => assertCanSetTenantStatus(actor(), 'tenant-a', 'suspended')).not.toThrow();
  });

  it('projects tenant status update result', () => {
    expect(toTenantStatusResult({ id: 't1', status: 'suspended' })).toEqual({
      id: 't1',
      status: 'suspended',
    });
  });
});
