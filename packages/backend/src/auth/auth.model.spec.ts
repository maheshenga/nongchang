import { describe, expect, it } from 'vitest';
import { Role } from '@nongchang/shared';
import { canRefreshSession, isKnownRole, toAuthUser } from './auth.model';

describe('auth model helpers', () => {
  it('recognizes only shared roles as valid password-login roles', () => {
    expect(isKnownRole(Role.MERCHANT)).toBe(true);
    expect(isKnownRole(Role.MEMBER)).toBe(true);
    expect(isKnownRole(Role.AGENT_ADMIN)).toBe(true);
    expect(isKnownRole(Role.SYSTEM_ADMIN)).toBe(true);
    expect(isKnownRole(Role.PLATFORM_ADMIN)).toBe(true);
    expect(isKnownRole('owner')).toBe(false);
    expect(isKnownRole('')).toBe(false);
  });

  it('projects DB users into AuthUser token payloads with existing owner/session semantics', () => {
    expect(toAuthUser({
      id: 'merchant-1',
      tenantId: 'tenant-1',
      role: Role.MERCHANT,
      agentId: 'agent-1',
      sessionVersion: 3,
    })).toEqual({
      userId: 'merchant-1',
      tenantId: 'tenant-1',
      role: Role.MERCHANT,
      agentId: 'agent-1',
      ownerId: 'merchant-1',
      sessionVersion: 3,
      sessionKind: 'generic',
    });

    expect(toAuthUser({
      id: 'member-1',
      tenantId: 'tenant-1',
      role: Role.MEMBER,
      agentId: null,
    })).toEqual({
      userId: 'member-1',
      tenantId: 'tenant-1',
      role: Role.MEMBER,
      agentId: null,
      ownerId: null,
      sessionVersion: 0,
      sessionKind: 'generic',
    });

    expect(toAuthUser({
      id: 'agent-admin-1',
      tenantId: 'tenant-1',
      role: Role.AGENT_ADMIN,
      agentId: 'agent-1',
    }).ownerId).toBeNull();
  });

  it('accepts refresh only when account, tenant, and sessionVersion still match', () => {
    const activeUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: Role.MERCHANT,
      agentId: null,
      status: 'active',
      sessionVersion: 2,
      tenant: { status: 'active' },
    };

    expect(canRefreshSession(activeUser, 2)).toBe(true);
    expect(canRefreshSession({ ...activeUser, status: 'suspended' }, 2)).toBe(false);
    expect(canRefreshSession({ ...activeUser, tenant: { status: 'suspended' } }, 2)).toBe(false);
    expect(canRefreshSession({ ...activeUser, sessionVersion: 3 }, 2)).toBe(false);
    expect(canRefreshSession(null, 2)).toBe(false);
  });

  it('defaults missing DB sessionVersion to 0 for refresh compatibility', () => {
    expect(canRefreshSession({
      id: 'user-1',
      tenantId: 'tenant-1',
      role: Role.MERCHANT,
      agentId: null,
      status: 'active',
      tenant: { status: 'active' },
    }, 0)).toBe(true);
  });
});
