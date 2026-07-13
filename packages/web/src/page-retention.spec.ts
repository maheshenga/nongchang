import { describe, expect, it } from 'vitest';
import { ACTIVE_ONLY_TABS, updateRetainedTabs } from './page-retention';

describe('page retention', () => {
  const allowed = ['overview', 'fields', 'records', 'logistics', 'settings', 'batches', 'aiAssistant'] as const;

  it('keeps the active page plus the two most recent eligible inactive pages', () => {
    const retained = updateRetainedTabs(['overview', 'records', 'logistics'], 'settings', allowed);

    expect(retained).toEqual(['records', 'logistics', 'settings']);
  });

  it('removes pages that are no longer authorized', () => {
    const retained = updateRetainedTabs(['overview', 'records', 'settings'], 'overview', ['overview', 'settings']);

    expect(retained).toEqual(['settings', 'overview']);
  });

  it('does not retain map, AI, or batch-heavy pages after leaving them', () => {
    expect([...ACTIVE_ONLY_TABS]).toEqual(['fields', 'aiAssistant', 'batches']);

    const withFieldActive = updateRetainedTabs(['overview'], 'fields', allowed);
    expect(withFieldActive).toEqual(['overview', 'fields']);

    const afterLeavingField = updateRetainedTabs(withFieldActive, 'records', allowed);
    expect(afterLeavingField).toEqual(['overview', 'records']);
  });

  it('honors a smaller explicit total retention limit', () => {
    expect(updateRetainedTabs(['overview', 'records'], 'settings', allowed, 2)).toEqual(['records', 'settings']);
  });
});
