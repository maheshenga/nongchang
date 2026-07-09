import { describe, expect, it } from 'vitest';
import { Role, type AuthUser } from '@nongchang/shared';
import {
  AGENT_LIST_SELECT,
  DEFAULT_AGENT_LIST_CAP,
  MERCHANT_LIST_SELECT,
  buildAgentCreateData,
  buildAgentListItem,
  buildAgentListWhere,
  buildAgentSessionRevocationWhere,
  buildAgentStatusUpdateData,
  buildAgentUpdateData,
  buildMerchantListWhere,
  buildPagination,
} from './agent.model';

const baseUser: AuthUser = {
  userId: 'u1',
  tenantId: 't1',
  role: Role.SYSTEM_ADMIN,
  agentId: null,
  ownerId: null,
};

describe('agent model helpers', () => {
  it('builds agent create and list data', () => {
    expect(DEFAULT_AGENT_LIST_CAP).toBe(500);
    expect(AGENT_LIST_SELECT).toEqual({
      id: true,
      name: true,
      region: true,
      status: true,
      createdAt: true,
      _count: { select: { users: { where: { role: Role.MERCHANT, status: { not: 'pending' } } } } },
    });
    expect(buildAgentCreateData(baseUser, { name: '华东代理', region: '华东' })).toEqual({
      tenantId: 't1',
      name: '华东代理',
      region: '华东',
    });
    expect(buildAgentListWhere(baseUser)).toEqual({ tenantId: 't1' });
  });

  it('projects agent list rows with merchant count', () => {
    expect(buildAgentListItem({
      id: 'a1',
      name: '华东代理',
      region: '华东',
      status: 'active',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      _count: { users: 5 },
    })).toEqual({
      id: 'a1',
      name: '华东代理',
      region: '华东',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      merchantCount: 5,
    });
  });

  it('builds sparse update and status data', () => {
    expect(buildAgentUpdateData({ name: '新代理' })).toEqual({ name: '新代理' });
    expect(buildAgentUpdateData({ region: '华南' })).toEqual({ region: '华南' });
    expect(buildAgentUpdateData({ name: '新代理', region: '华南' })).toEqual({ name: '新代理', region: '华南' });
    expect(buildAgentUpdateData({})).toEqual({});
    expect(buildAgentStatusUpdateData('suspended')).toEqual({ status: 'suspended' });
    expect(buildAgentSessionRevocationWhere(baseUser, 'a1')).toEqual({ tenantId: 't1', agentId: 'a1' });
  });

  it('builds merchant list scope where clauses', () => {
    expect(MERCHANT_LIST_SELECT).toEqual({
      id: true,
      username: true,
      role: true,
      agentId: true,
      displayName: true,
    });
    expect(buildMerchantListWhere(baseUser)).toEqual({ tenantId: 't1', role: Role.MERCHANT });
    expect(buildMerchantListWhere({ ...baseUser, role: Role.AGENT_ADMIN, agentId: 'a1' })).toEqual({
      tenantId: 't1',
      role: Role.MERCHANT,
      agentId: 'a1',
    });
    expect(buildMerchantListWhere({ ...baseUser, role: Role.AGENT_ADMIN, agentId: null })).toBeNull();
  });

  it('builds pagination parameters with legacy non-paginated cap', () => {
    expect(buildPagination()).toEqual({ paginated: false, page: 1, pageSize: 20, skip: 0, take: 500 });
    expect(buildPagination({ page: 2, pageSize: 10 })).toEqual({
      paginated: true,
      page: 2,
      pageSize: 10,
      skip: 10,
      take: 10,
    });
    expect(buildPagination({ page: 3 })).toEqual({ paginated: true, page: 3, pageSize: 20, skip: 40, take: 20 });
  });
});
