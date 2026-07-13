import type { SystemRole } from './navigation';

const STORAGE_PREFIX = 'nongchang:navigation-open:v1';

export function navigationPreferenceKey(tenantId: string, userId: string, role: SystemRole): string {
  return `${STORAGE_PREFIX}:${tenantId}:${userId}:${role}`;
}

export function loadOpenNavigationCategories(
  raw: string | null,
  categories: readonly string[],
): Set<string> {
  if (raw === null) return new Set(categories);

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(value => typeof value === 'string')) {
      return new Set(categories);
    }

    const available = new Set(categories);
    return new Set(parsed.filter(category => available.has(category)));
  } catch {
    return new Set(categories);
  }
}

export function serializeOpenNavigationCategories(open: ReadonlySet<string>): string {
  return JSON.stringify([...open]);
}

export function safeReadNavigationPreference(
  storage: Pick<Storage, 'getItem'> | null,
  key: string,
  categories: readonly string[],
): Set<string> {
  try {
    if (!storage) return new Set(categories);
    return loadOpenNavigationCategories(storage.getItem(key), categories);
  } catch {
    return new Set(categories);
  }
}

export function safeWriteNavigationPreference(
  storage: Pick<Storage, 'setItem'> | null,
  key: string,
  open: ReadonlySet<string>,
): void {
  try {
    if (!storage) return;
    storage.setItem(key, serializeOpenNavigationCategories(open));
  } catch {
    // Storage denial should not make navigation unusable.
  }
}

export function getBrowserLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function toggleNavigationCategory(open: ReadonlySet<string>, category: string): Set<string> {
  const next = new Set(open);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return next;
}
