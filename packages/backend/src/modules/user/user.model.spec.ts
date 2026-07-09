import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import {
  buildMerchantTargetWhere,
  buildUserScopedWhere,
  buildUserStatusUpdateData,
  resolveCreateUserAgentId,
  reviewActionToStatus,
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
