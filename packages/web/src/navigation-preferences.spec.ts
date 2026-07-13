import { describe, expect, it } from 'vitest';
import {
  loadOpenNavigationCategories,
  navigationPreferenceKey,
  serializeOpenNavigationCategories,
  toggleNavigationCategory,
} from './navigation-preferences';

describe('navigation preferences', () => {
  const categories = ['生产与供应链', '平台组织管理', '系统'] as const;

  it('uses a role-specific storage key', () => {
    expect(navigationPreferenceKey('system_admin')).not.toBe(navigationPreferenceKey('merchant_admin'));
  });

  it('opens every available category when storage is missing or invalid', () => {
    expect([...loadOpenNavigationCategories(null, categories)]).toEqual(categories);
    expect([...loadOpenNavigationCategories('{broken', categories)]).toEqual(categories);
    expect([...loadOpenNavigationCategories(JSON.stringify({ open: categories }), categories)]).toEqual(categories);
  });

  it('restores only valid serialized categories', () => {
    const raw = JSON.stringify(['系统', '已移除分组']);

    expect([...loadOpenNavigationCategories(raw, categories)]).toEqual(['系统']);
  });

  it('serializes deterministically and toggles without mutating the original set', () => {
    const original = new Set(['系统', '生产与供应链']);
    const next = toggleNavigationCategory(original, '系统');

    expect([...original]).toEqual(['系统', '生产与供应链']);
    expect([...next]).toEqual(['生产与供应链']);
    expect(serializeOpenNavigationCategories(next)).toBe(JSON.stringify(['生产与供应链']));
  });
});
