const LABEL_FIELDS = ['name', 'batchNo', 'action', 'purpose', 'kind', 'resource', 'reason'] as const;

export function formatAccountDate(value: string | null | undefined): string {
  if (!value) return '时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function accountRecordLabel(item: unknown, categoryLabel: string): string {
  const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  for (const field of LABEL_FIELDS) {
    const value = row[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return `未命名${categoryLabel}`;
}
