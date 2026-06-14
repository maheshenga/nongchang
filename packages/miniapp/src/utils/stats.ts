interface Dated { recordedAt: string }

export function countThisMonth<T extends Dated>(recs: T[], now: Date): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return recs.filter((r) => {
    const d = new Date(r.recordedAt);
    return d.getUTCFullYear() === y && d.getUTCMonth() === m;
  }).length;
}

export function sortByRecentDesc<T extends Dated>(recs: T[]): T[] {
  return [...recs].sort(
    (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
  );
}

const TRACE_META: Record<string, { label: string; color: string }> = {
  origin: { label: '产地', color: '#0ea5e9' },
  farm: { label: '种植', color: '#10b981' },
  harvest: { label: '采收', color: '#f59e0b' },
  warehouse: { label: '仓储', color: '#6366f1' },
  logistics: { label: '物流', color: '#8b5cf6' },
  retail: { label: '零售', color: '#ec4899' },
};

export function traceTypeMeta(type: string): { label: string; color: string } {
  return TRACE_META[type] ?? { label: '其他', color: '#64748b' };
}
