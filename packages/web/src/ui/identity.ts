export interface FriendlyIdentity {
  label: string;
  technicalId: string;
  shortId: string;
  isFallback: boolean;
}

export function friendlyIdentity({ id, label, fallback }: {
  id: string | null | undefined;
  label?: string | null;
  fallback: string;
}): FriendlyIdentity {
  const technicalId = id?.trim() ?? '';
  const resolved = label?.trim();
  return {
    label: resolved || fallback,
    technicalId,
    shortId: technicalId ? technicalId.slice(0, 8) : '无编号',
    isFallback: !resolved,
  };
}

export function buildIdentityMap<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  labelOf: (item: T) => string | null | undefined,
): ReadonlyMap<string, string> {
  return new Map(items.map(item => [idOf(item), labelOf(item)?.trim() || '']));
}
