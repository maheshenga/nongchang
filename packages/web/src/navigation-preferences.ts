import type { SystemRole } from './navigation';

const STORAGE_PREFIX = 'nongchang:navigation-open';

export function navigationPreferenceKey(role: SystemRole): string {
  return `${STORAGE_PREFIX}:${role}`;
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

export function toggleNavigationCategory(open: ReadonlySet<string>, category: string): Set<string> {
  const next = new Set(open);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return next;
}
