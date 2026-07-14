import { describe, expect, it } from 'vitest';
import { accountRecordLabel, formatAccountDate } from './presentation';

describe('account-data presentation', () => {
  it('formats valid dates for people and keeps missing values explicit', () => {
    expect(formatAccountDate('2026-07-14T09:00:00.000Z')).toMatch(/2026/);
    expect(formatAccountDate('2026-07-14T09:00:00.000Z')).not.toContain('T09:00:00.000Z');
    expect(formatAccountDate(null)).toBe('时间未知');
    expect(formatAccountDate('not-a-date')).toBe('时间未知');
  });

  it('uses meaningful record fields without falling back to opaque identifiers', () => {
    expect(accountRecordLabel({ id: 'opaque' }, '上传记录')).toBe('未命名上传记录');
    expect(accountRecordLabel({ batchNo: 'B-1', id: 'opaque' }, '批次')).toBe('B-1');
    expect(accountRecordLabel({ name: ' 一号田 ', id: 'opaque' }, '地块')).toBe('一号田');
    expect(accountRecordLabel({ resource: 'AI', id: 'opaque' }, '额度流水')).toBe('AI');
  });
});
