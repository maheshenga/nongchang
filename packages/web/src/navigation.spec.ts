import { describe, expect, it } from 'vitest';
import { firstAllowedTab, flattenNavItems, getNavItems, isDemoTab, type SystemRole } from './navigation';

const ALL_ROLES: SystemRole[] = [
  'system_admin',
  'agent_admin',
  'merchant_admin',
  'platform_admin',
  'member',
];

const idsFor = (role: SystemRole) =>
  flattenNavItems(getNavItems(role)).map((item) => item.id);

describe('production navigation', () => {
  it('exposes supply management to merchants', () => {
    expect(idsFor('merchant_admin')).toContain('logistics');
  });

  it('keeps demo-only surfaces out of role navigation', () => {
    for (const role of ALL_ROLES) {
      expect(idsFor(role)).not.toContain('dashboard');
      expect(idsFor(role)).not.toContain('mobile');
      expect(idsFor(role)).not.toContain('warehouse');
    }
  });

  it('limits platform admins to tenant lifecycle navigation', () => {
    const platformIds = idsFor('platform_admin');

    expect(platformIds).toEqual(['tenants']);
    for (const tenantInternalTab of ['billing', 'merchantFiles', 'agents', 'fields', 'userGroups', 'pendingUsers'] as const) {
      expect(platformIds).not.toContain(tenantInternalTab);
    }
  });

  it('does not expose pending user review to agent admins without agent-bound registration', () => {
    expect(idsFor('agent_admin')).not.toContain('pendingUsers');
  });

  it('classifies legacy demo tabs and falls back to the first allowed tab', () => {
    expect(isDemoTab('dashboard')).toBe(true);
    expect(isDemoTab('mobile')).toBe(true);
    expect(isDemoTab('warehouse')).toBe(true);
    expect(firstAllowedTab('merchant_admin', 'dashboard')).toBe('fields');
    expect(firstAllowedTab('merchant_admin', 'logistics')).toBe('logistics');
    expect(firstAllowedTab('agent_admin', 'fields')).toBe('merchantFiles');
    expect(firstAllowedTab('platform_admin', 'dashboard')).toBe('tenants');
  });

  it('limits ordinary members to local settings only', () => {
    expect(idsFor('member')).toEqual(['settings']);
    expect(firstAllowedTab('member', 'fields')).toBe('settings');
    expect(firstAllowedTab('member', 'settings')).toBe('settings');
  });
});
