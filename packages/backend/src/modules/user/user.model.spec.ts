import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import {
  DEFAULT_USER_LIST_CAP,
  MERCHANT_USER_LIST_SELECT,
  PENDING_USER_LIST_SELECT,
  USER_LIST_SELECT,
  buildMerchantFieldAggregateWhere,
  buildMerchantListFindManyArgs,
  buildMerchantListWhere,
  buildMerchantTargetWhere,
  buildPendingMerchantListFindManyArgs,
  buildPendingMerchantListWhere,
  buildUserListFindManyArgs,
  buildUserScopedWhere,
  buildUserStatusUpdateData,
  getMerchantIds,
  resolveCreateUserAgentId,
  resolveUserListPagination,
  reviewActionToStatus,
  toMerchantListItems,
  toPaginatedUserList,
} from './user.model';

const actor = (overrides: Partial<AuthUser>): AuthUser => ({
  userId: 'u1',
  tenantId: 't1',
  role: Role.SYSTEM_ADMIN,
  agentId: null,
  ownerId: null,
  sessionVersion: 0,
  ...overrides,
});

describe('user.model scope helpers', () => {
  it('builds tenant-wide scope for tenant administrators', () => {
    expect(buildUserScopedWhere(actor({ role: Role.SYSTEM_ADMIN }))).toEqual({ tenantId: 't1' });
  });

  it('builds agent scope for agent administrators', () => {
    expect(buildUserScopedWhere(actor({ role: Role.AGENT_ADMIN, agentId: 'a1' }))).toEqual({
      tenantId: 't1',
      agentId: 'a1',
    });
  });

  it('rejects agent administrators without an agentId before querying', () => {
    expect(() => buildUserScopedWhere(actor({ role: Role.AGENT_ADMIN, agentId: null })))
      .toThrow(ForbiddenException);
  });

  it('builds pending merchant target filters inside actor scope', () => {
    expect(buildMerchantTargetWhere(actor({ role: Role.AGENT_ADMIN, agentId: 'a1' }), 'm1', 'pending')).toEqual({
      tenantId: 't1',
      agentId: 'a1',
      id: 'm1',
      role: Role.MERCHANT,
      status: 'pending',
    });
  });

  it('builds manageable merchant target filters that exclude pending users', () => {
    expect(buildMerchantTargetWhere(actor({ role: Role.SYSTEM_ADMIN }), 'm1', 'manageable')).toEqual({
      tenantId: 't1',
      id: 'm1',
      role: Role.MERCHANT,
      status: { not: 'pending' },
    });
  });
});

describe('user.model list helpers', () => {
  it('builds capped and paginated general user list args', () => {
    const where = { tenantId: 't1' };

    expect(resolveUserListPagination()).toEqual({
      paginated: false,
      page: 1,
      pageSize: 20,
      skip: 0,
      take: DEFAULT_USER_LIST_CAP,
    });
    expect(buildUserListFindManyArgs(where)).toEqual({
      where,
      select: USER_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: DEFAULT_USER_LIST_CAP,
    });
    expect(buildUserListFindManyArgs(where, { page: 3, pageSize: 25 })).toEqual({
      where,
      select: USER_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: 50,
      take: 25,
    });
  });

  it('builds merchant and pending merchant list where clauses inside actor scope', () => {
    expect(buildMerchantListWhere(actor({ role: Role.AGENT_ADMIN, agentId: 'a1' }))).toEqual({
      tenantId: 't1',
      agentId: 'a1',
      role: Role.MERCHANT,
      status: { not: 'pending' },
    });
    expect(buildPendingMerchantListWhere(actor({ role: Role.SYSTEM_ADMIN }))).toEqual({
      tenantId: 't1',
      role: Role.MERCHANT,
      status: 'pending',
    });
  });

  it('builds merchant and pending findMany args with stable selects', () => {
    const merchantWhere = { tenantId: 't1', role: Role.MERCHANT, status: { not: 'pending' } };
    const pendingWhere = { tenantId: 't1', role: Role.MERCHANT, status: 'pending' };

    expect(buildMerchantListFindManyArgs(merchantWhere, { page: 2, pageSize: 10 })).toEqual({
      where: merchantWhere,
      orderBy: { createdAt: 'desc' },
      select: MERCHANT_USER_LIST_SELECT,
      skip: 10,
      take: 10,
    });
    expect(buildPendingMerchantListFindManyArgs(pendingWhere)).toEqual({
      where: pendingWhere,
      orderBy: { createdAt: 'desc' },
      select: PENDING_USER_LIST_SELECT,
      skip: 0,
      take: DEFAULT_USER_LIST_CAP,
    });
    expect(MERCHANT_USER_LIST_SELECT).toMatchObject({
      groupId: true,
      group: { select: { name: true } },
    });
  });

  it('builds paginated envelopes without transforming raw user rows', () => {
    const items = [{ id: 'u1', createdAt: new Date('2026-07-06T00:00:00.000Z') }];

    expect(toPaginatedUserList(items, 5, { page: 2, pageSize: 1 })).toEqual({
      items,
      total: 5,
      page: 2,
      pageSize: 1,
    });
  });

  it('projects merchant aggregate fields and skips empty aggregate queries', () => {
    const merchants = [
      {
        id: 'm1',
        username: 'u1',
        displayName: 'Merchant 1',
        phone: null,
        status: 'active',
        agentId: 'a1',
        groupId: 'g31',
        group: { name: '默认用户组' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'm2',
        username: 'u2',
        displayName: 'Merchant 2',
        phone: '13800000002',
        status: 'active',
        agentId: null,
        groupId: null,
        group: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ];

    expect(getMerchantIds(merchants)).toEqual(['m1', 'm2']);
    expect(buildMerchantFieldAggregateWhere('t1', [])).toBeNull();
    expect(buildMerchantFieldAggregateWhere('t1', ['m1', 'm2'])).toEqual({
      tenantId: 't1',
      ownerId: { in: ['m1', 'm2'] },
    });
    expect(toMerchantListItems(merchants, [
      { ownerId: 'm1', _count: { _all: 3 }, _sum: { area: 12.5 } },
    ])).toEqual([
      {
        id: 'm1',
        username: 'u1',
        displayName: 'Merchant 1',
        phone: null,
        status: 'active',
        agentId: 'a1',
        groupId: 'g31',
        groupName: '默认用户组',
        createdAt: '2026-01-01T00:00:00.000Z',
        fieldCount: 3,
        totalArea: 12.5,
      },
      {
        id: 'm2',
        username: 'u2',
        displayName: 'Merchant 2',
        phone: '13800000002',
        status: 'active',
        agentId: null,
        groupId: null,
        groupName: null,
        createdAt: '2026-01-02T00:00:00.000Z',
        fieldCount: 0,
        totalArea: 0,
      },
    ]);
    expect(toMerchantListItems(merchants, [])[0]).not.toHaveProperty('group');
  });
});

describe('user.model create helpers', () => {
  it('forces member accounts to null agentId even when dto includes an agent', () => {
    expect(resolveCreateUserAgentId(
      actor({ role: Role.SYSTEM_ADMIN }),
      { role: Role.MEMBER, agentId: 'a9' },
    )).toBeNull();
  });

  it('lets tenant administrators assign a merchant agentId from dto', () => {
    expect(resolveCreateUserAgentId(
      actor({ role: Role.SYSTEM_ADMIN }),
      { role: Role.MERCHANT, agentId: 'a9' },
    )).toBe('a9');
  });

  it('defaults tenant-created merchant agentId to null', () => {
    expect(resolveCreateUserAgentId(
      actor({ role: Role.SYSTEM_ADMIN }),
      { role: Role.MERCHANT },
    )).toBeNull();
  });

  it('forces agent administrators to create merchants under their own agent', () => {
    expect(resolveCreateUserAgentId(
      actor({ role: Role.AGENT_ADMIN, agentId: 'a1' }),
      { role: Role.MERCHANT, agentId: 'a9' },
    )).toBe('a1');
  });

  it('rejects agent administrators creating ordinary members', () => {
    expect(() => resolveCreateUserAgentId(
      actor({ role: Role.AGENT_ADMIN, agentId: 'a1' }),
      { role: Role.MEMBER },
    )).toThrow(ForbiddenException);
  });

  it('rejects agent administrators without an agentId before creating users', () => {
    expect(() => resolveCreateUserAgentId(
      actor({ role: Role.AGENT_ADMIN, agentId: null }),
      { role: Role.MERCHANT },
    )).toThrow(ForbiddenException);
  });
});

describe('user.model status helpers', () => {
  it('increments sessionVersion when suspending a merchant', () => {
    expect(buildUserStatusUpdateData('suspended')).toEqual({
      status: 'suspended',
      sessionVersion: { increment: 1 },
    });
  });

  it('does not increment sessionVersion when activating a merchant', () => {
    expect(buildUserStatusUpdateData('active')).toEqual({ status: 'active' });
  });

  it('maps review approve/reject actions to stored statuses', () => {
    expect(reviewActionToStatus('approve')).toBe('active');
    expect(reviewActionToStatus('reject')).toBe('rejected');
  });
});
