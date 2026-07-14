import { describe, expect, it } from 'vitest';
import { canonicalAllowedTab, parseAuthenticatedTab, tabToHash } from './app-route';
import type { AppTab } from './navigation';

describe('authenticated app route contract', () => {
  it('serializes stable workspace hashes', () => {
    expect(tabToHash('overview')).toBe('#/app/overview');
    expect(tabToHash('batches')).toBe('#/app/batches');
    expect(tabToHash('memberHome')).toBe('#/app/member-home');
    expect(tabToHash('aiOssSettings')).toBe('#/app/ai-oss-settings');
    expect(tabToHash('legalSettings')).toBe('#/app/legal-settings');
  });

  it('parses only known authenticated workspace routes', () => {
    expect(parseAuthenticatedTab('#/app/records')).toBe('records');
    expect(parseAuthenticatedTab('#/app/quick-templates?from=search')).toBe('quickTemplates');
    expect(parseAuthenticatedTab('#/trace/ORC-ABC')).toBeNull();
    expect(parseAuthenticatedTab('#/app/not-a-tab')).toBeNull();
  });

  it('maps every app tab in both directions', () => {
    const tabs: AppTab[] = [
      'overview',
      'memberHome',
      'tenants',
      'fields',
      'merchant',
      'batches',
      'records',
      'logistics',
      'settings',
      'agents',
      'merchantFiles',
      'aiProviders',
      'aiOssSettings',
      'integrations',
      'userGroups',
      'pendingUsers',
      'quickTemplates',
      'aiAssistant',
      'phenology',
      'billing',
      'legalSettings',
    ];

    for (const tab of tabs) {
      expect(parseAuthenticatedTab(tabToHash(tab))).toBe(tab);
    }
  });

  it('falls back to the first route allowed for the role', () => {
    expect(canonicalAllowedTab('#/app/tenants', 'merchant_admin')).toBe('overview');
    expect(canonicalAllowedTab('#/app/batches', 'merchant_admin')).toBe('batches');
    expect(canonicalAllowedTab('#/app/overview', 'platform_admin')).toBe('tenants');
    expect(canonicalAllowedTab('#/app/missing', 'member')).toBe('memberHome');
    expect(canonicalAllowedTab('#/app/legal-settings', 'system_admin')).toBe('legalSettings');
    expect(canonicalAllowedTab('#/app/legal-settings', 'merchant_admin')).toBe('overview');
  });
});
