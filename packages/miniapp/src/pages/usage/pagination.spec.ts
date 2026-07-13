import { describe, expect, it } from 'vitest';
import {
  createLedgerState,
  failLedgerPage,
  mergeLedgerPage,
  resetLedgerFilters,
  startLedgerPage,
} from './pagination';

const item = (id: string) => ({
  id,
  resource: 'AI' as const,
  delta: -1,
  balanceAfter: 9,
  reason: 'CONSUME' as const,
  refType: null,
  refId: null,
  note: null,
  createdAt: '2026-07-13T00:00:00.000Z',
});

describe('usage ledger pagination', () => {
  it('appends later pages without duplicating ledger ids', () => {
    const first = mergeLedgerPage(createLedgerState(), {
      items: [item('ledger-1'), item('ledger-2')],
      total: 3,
      page: 1,
      pageSize: 2,
    });

    const second = mergeLedgerPage(first, {
      items: [item('ledger-2'), item('ledger-3')],
      total: 3,
      page: 2,
      pageSize: 2,
    });

    expect(second.items.map((entry) => entry.id)).toEqual(['ledger-1', 'ledger-2', 'ledger-3']);
    expect(second.hasMore).toBe(false);
  });

  it('blocks duplicate append starts and preserves items when append fails', () => {
    const loaded = mergeLedgerPage(createLedgerState(), {
      items: [item('ledger-1')],
      total: 2,
      page: 1,
      pageSize: 1,
    });
    const loading = startLedgerPage(loaded, 2);

    expect(loading.appendLoading).toBe(true);
    expect(startLedgerPage(loading, 2)).toBe(loading);
    expect(failLedgerPage(loading, 2, '网络失败')).toMatchObject({
      items: [item('ledger-1')],
      appendLoading: false,
      appendError: '网络失败',
    });
  });

  it('clears pagination when filters change', () => {
    const loaded = mergeLedgerPage(createLedgerState(), {
      items: [item('ledger-1')],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    expect(resetLedgerFilters(loaded, { resource: 'AI' })).toEqual({
      ...createLedgerState({ resource: 'AI' }),
      initialLoading: true,
    });
  });
});
