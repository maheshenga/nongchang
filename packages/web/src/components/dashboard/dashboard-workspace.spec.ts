import { describe, expect, it } from 'vitest';
import { flattenNavItems, getNavItems, type SystemRole } from '../../navigation';
import { dashboardQuickActions, dashboardTitle } from './dashboard-workspace';

const expectedTabs: Record<SystemRole, string[]> = {
  merchant_admin: ['records', 'batches', 'fields'],
  agent_admin: ['merchantFiles', 'batches', 'billing'],
  system_admin: ['pendingUsers', 'integrations', 'billing'],
  platform_admin: ['tenants'],
  member: ['memberHome', 'settings'],
};

describe('dashboard workspace composition', () => {
  it.each(Object.keys(expectedTabs) as SystemRole[])('keeps %s quick actions inside role navigation', (role) => {
    const actions = dashboardQuickActions(role);
    const allowed = new Set(flattenNavItems(getNavItems(role)).map(item => item.id));

    expect(actions.map(action => action.tab)).toEqual(expectedTabs[role]);
    expect(actions.every(action => allowed.has(action.tab))).toBe(true);
  });

  it('uses role-specific production titles', () => {
    expect(dashboardTitle('merchant_admin')).toBe('商户生产工作台');
    expect(dashboardTitle('system_admin')).toBe('租户运营工作台');
    expect(dashboardTitle('platform_admin')).toBe('平台租户工作台');
  });
});
