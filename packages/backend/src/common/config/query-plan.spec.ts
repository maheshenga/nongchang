import { describe, expect, it } from 'vitest';
import { findLargeSequentialScans } from '../../../scripts/check-query-plans';

describe('findLargeSequentialScans', () => {
  it('finds nested high-row sequential scans', () => {
    const plan = [{ Plan: {
      'Node Type': 'Limit',
      Plans: [{
        'Node Type': 'Seq Scan',
        'Relation Name': 'trace_scans',
        'Plan Rows': 50_000,
      }],
    } }];

    expect(findLargeSequentialScans(plan, 1_000)).toEqual([
      { relation: 'trace_scans', planRows: 50_000 },
    ]);
  });

  it('accepts index scans and small-table sequential scans', () => {
    const plan = [{ Plan: {
      'Node Type': 'Nested Loop',
      Plans: [
        { 'Node Type': 'Index Scan', 'Relation Name': 'batches', 'Plan Rows': 10_000 },
        { 'Node Type': 'Seq Scan', 'Relation Name': 'tenants', 'Plan Rows': 20 },
      ],
    } }];

    expect(findLargeSequentialScans(plan, 1_000)).toEqual([]);
  });
});
