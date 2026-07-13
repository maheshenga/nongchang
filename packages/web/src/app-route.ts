import { firstAllowedTab, type AppTab, type SystemRole } from './navigation';

const AUTHENTICATED_ROUTE_PREFIX = '#/app/';

const TAB_SEGMENTS = {
  overview: 'overview',
  memberHome: 'member-home',
  tenants: 'tenants',
  fields: 'fields',
  merchant: 'merchant',
  batches: 'batches',
  records: 'records',
  logistics: 'logistics',
  settings: 'settings',
  agents: 'agents',
  merchantFiles: 'merchant-files',
  aiProviders: 'ai-providers',
  aiOssSettings: 'ai-oss-settings',
  integrations: 'integrations',
  userGroups: 'user-groups',
  pendingUsers: 'pending-users',
  quickTemplates: 'quick-templates',
  aiAssistant: 'ai-assistant',
  phenology: 'phenology',
  billing: 'billing',
} as const satisfies Record<AppTab, string>;

const SEGMENT_TABS = new Map<string, AppTab>(
  Object.entries(TAB_SEGMENTS).map(([tab, segment]) => [segment, tab as AppTab]),
);

export function tabToHash(tab: AppTab): string {
  return `${AUTHENTICATED_ROUTE_PREFIX}${TAB_SEGMENTS[tab]}`;
}

export function parseAuthenticatedTab(hash: string): AppTab | null {
  if (!hash.startsWith(AUTHENTICATED_ROUTE_PREFIX)) return null;
  const segment = hash.slice(AUTHENTICATED_ROUTE_PREFIX.length).split(/[?#]/, 1)[0].replace(/\/+$/, '');
  if (!segment || segment.includes('/')) return null;
  return SEGMENT_TABS.get(segment) ?? null;
}

export function canonicalAllowedTab(hash: string, role: SystemRole): AppTab {
  return firstAllowedTab(role, parseAuthenticatedTab(hash));
}
