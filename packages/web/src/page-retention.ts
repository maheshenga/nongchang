import type { AppTab } from './navigation';

export const ACTIVE_ONLY_TABS: ReadonlySet<AppTab> = new Set(['fields', 'aiAssistant', 'batches']);

export function updateRetainedTabs(
  previous: readonly AppTab[],
  active: AppTab,
  allowed: readonly AppTab[],
  limit = 3,
): AppTab[] {
  const allowedTabs = new Set(allowed);
  const retained: AppTab[] = [];

  for (const tab of previous) {
    if (
      tab !== active
      && allowedTabs.has(tab)
      && !ACTIVE_ONLY_TABS.has(tab)
      && !retained.includes(tab)
    ) {
      retained.push(tab);
    }
  }

  retained.push(active);
  return retained.slice(-Math.max(1, limit));
}
