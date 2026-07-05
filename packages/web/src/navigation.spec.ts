import { describe, expect, it } from 'vitest';
import { firstAllowedTab, flattenNavItems, getNavItems, isDemoTab } from './navigation';

const idsFor = (role: 'system_admin' | 'agent_admin' | 'merchant_admin') =>
  flattenNavItems(getNavItems(role)).map((item) => item.id);

describe('production navigation', () => {
  it('exposes supply management to merchants', () => {
    expect(idsFor('merchant_admin')).toContain('logistics');
  });

  it('keeps demo-only surfaces out of role navigation', () => {
    for (const role of ['system_admin', 'agent_admin', 'merchant_admin'] as const) {
      expect(idsFor(role)).not.toContain('dashboard');
      expect(idsFor(role)).not.toContain('mobile');
      expect(idsFor(role)).not.toContain('warehouse');
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
  });
});
