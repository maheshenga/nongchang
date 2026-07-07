import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as navigation from './navigation';
import { firstAllowedTab, flattenNavItems, getNavItems, type SystemRole } from './navigation';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  it('does not export legacy demo tab helpers from the production navigation contract', () => {
    expect(navigation).not.toHaveProperty('isDemoTab');
  });

  it('keeps legacy demo component hints out of the production shell and CSS bundle inputs', () => {
    const appSource = readFileSync(resolve(__dirname, 'App.tsx'), 'utf8');
    const cssSource = readFileSync(resolve(__dirname, 'index.css'), 'utf8');

    expect(appSource).not.toMatch(/MobileView|warehouse/);
    expect(cssSource).not.toMatch(/MobileView|themeTheme/);
    expect(cssSource).not.toContain('{bg,text,from,to,shadow}-{emerald,purple}');
    expect(cssSource).not.toContain('text-{emerald,purple}-100/90');
  });

  it('exposes the real production overview only to tenant business roles', () => {
    expect(idsFor('system_admin')[0]).toBe('overview');
    expect(idsFor('agent_admin')[0]).toBe('overview');
    expect(idsFor('merchant_admin')[0]).toBe('overview');
    expect(idsFor('platform_admin')).not.toContain('overview');
    expect(idsFor('member')).not.toContain('overview');
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

  it('falls back to the first allowed production tab for legacy or unauthorized tab strings', () => {
    expect(firstAllowedTab('merchant_admin', 'dashboard')).toBe('overview');
    expect(firstAllowedTab('system_admin', 'dashboard')).toBe('overview');
    expect(firstAllowedTab('agent_admin', 'dashboard')).toBe('overview');
    expect(firstAllowedTab('merchant_admin', 'logistics')).toBe('logistics');
    expect(firstAllowedTab('agent_admin', 'fields')).toBe('overview');
    expect(firstAllowedTab('platform_admin', 'warehouse')).toBe('tenants');
    expect(firstAllowedTab('member', 'dashboard')).toBe('settings');
  });

  it('limits ordinary members to local settings only', () => {
    expect(idsFor('member')).toEqual(['settings']);
    expect(firstAllowedTab('member', 'fields')).toBe('settings');
    expect(firstAllowedTab('member', 'settings')).toBe('settings');
  });
});
