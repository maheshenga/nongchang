import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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
  it('groups every system-admin route once into four operator-focused categories', () => {
    const categories = getNavItems('system_admin');

    expect(categories.map((category) => category.category)).toEqual([
      '生产管理',
      '组织管理',
      '智能与计费',
      '配置与合规',
    ]);
    expect(categories.map((category) => category.items.map((item) => item.id))).toEqual([
      ['overview', 'fields', 'records', 'phenology', 'batches', 'logistics'],
      ['agents', 'merchantFiles', 'userGroups', 'pendingUsers'],
      ['aiAssistant', 'aiProviders', 'billing'],
      ['aiOssSettings', 'integrations', 'quickTemplates', 'legalSettings', 'settings'],
    ]);
    expect(idsFor('system_admin')).toHaveLength(new Set(idsFor('system_admin')).size);
  });

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

  it('removes dead admin and mobile demo component files from production source', () => {
    for (const relativePath of [
      'components/SystemAdmin.tsx',
      'components/AgentPlatform.tsx',
      'components/legacy/MobileView.tsx',
    ]) {
      expect(existsSync(resolve(__dirname, relativePath)), relativePath).toBe(false);
    }
  });

  it('exposes legal publication settings only to system admins', () => {
    expect(idsFor('system_admin')).toContain('legalSettings');
    for (const role of ALL_ROLES.filter((item) => item !== 'system_admin')) {
      expect(idsFor(role)).not.toContain('legalSettings');
    }
  });

  it('falls back to the first allowed production tab for legacy or unauthorized tab strings', () => {
    expect(firstAllowedTab('merchant_admin', 'dashboard')).toBe('overview');
    expect(firstAllowedTab('system_admin', 'dashboard')).toBe('overview');
    expect(firstAllowedTab('agent_admin', 'dashboard')).toBe('overview');
    expect(firstAllowedTab('merchant_admin', 'logistics')).toBe('logistics');
    expect(firstAllowedTab('agent_admin', 'fields')).toBe('overview');
    expect(firstAllowedTab('platform_admin', 'warehouse')).toBe('tenants');
    expect(firstAllowedTab('member', 'dashboard')).toBe('memberHome');
  });

  it('gives ordinary members a safe trace-query home plus local settings', () => {
    expect(idsFor('member')).toEqual(['memberHome', 'settings']);
    expect(firstAllowedTab('member', 'fields')).toBe('memberHome');
    expect(firstAllowedTab('member', 'settings')).toBe('settings');
  });

  it('uses generic product wording for merchant navigation and workspaces', () => {
    const merchantItem = flattenNavItems(getNavItems('merchant_admin')).find(item => item.id === 'merchant');
    const merchantSource = readFileSync(resolve(__dirname, 'components/MerchantAdmin.tsx'), 'utf8');
    const recordsSource = readFileSync(resolve(__dirname, 'components/FarmRecords.tsx'), 'utf8');

    expect(merchantItem?.label).toBe('产品档案');
    expect(merchantSource).not.toContain('芍药');
    expect(recordsSource).not.toContain('芍药');
    expect(recordsSource).toContain('田间工作台');
  });
});
