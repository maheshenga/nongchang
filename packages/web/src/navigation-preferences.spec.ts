import { describe, expect, it } from 'vitest';
import {
  loadOpenNavigationCategories,
  navigationPreferenceKey,
  safeReadNavigationPreference,
  safeWriteNavigationPreference,
  serializeOpenNavigationCategories,
  toggleNavigationCategory,
} from './navigation-preferences';

describe('navigation preferences', () => {
  const categories = ['生产与供应链', '平台组织管理', '系统'] as const;

  it('isolates storage by tenant, user, and role', () => {
    expect(navigationPreferenceKey('tenant-a', 'user-a', 'system_admin'))
      .toBe('nongchang:navigation-open:v1:tenant-a:user-a:system_admin');
    expect(navigationPreferenceKey('tenant-a', 'user-a', 'system_admin'))
      .not.toBe(navigationPreferenceKey('tenant-a', 'user-b', 'system_admin'));
    expect(navigationPreferenceKey('tenant-a', 'user-a', 'system_admin'))
      .not.toBe(navigationPreferenceKey('tenant-b', 'user-a', 'system_admin'));
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

  it('reads and writes preferences without breaking the shell when storage is denied', () => {
    const throwingStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    } as unknown as Storage;

    expect([...safeReadNavigationPreference(throwingStorage, 'key', categories)]).toEqual(categories);
    expect(() => safeWriteNavigationPreference(throwingStorage, 'key', new Set(['系统']))).not.toThrow();
  });

  it('uses the same validation for safely persisted values', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
    } as Storage;

    safeWriteNavigationPreference(storage, 'key', new Set(['系统']));
    expect([...safeReadNavigationPreference(storage, 'key', categories)]).toEqual(['系统']);
  });
});
