import type {
  CreditLedgerItem,
  CreditResource,
  LedgerReason,
  PaginatedLedger,
} from '@nongchang/shared';

export interface LedgerFilters {
  resource?: CreditResource;
  reason?: LedgerReason;
}

export interface LedgerListState {
  items: CreditLedgerItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  filters: LedgerFilters;
  initialLoading: boolean;
  appendLoading: boolean;
  error: string | null;
  appendError: string | null;
}

export function createLedgerState(filters: LedgerFilters = {}): LedgerListState {
  return {
    items: [],
    total: 0,
    page: 0,
    pageSize: 20,
    hasMore: false,
    filters,
    initialLoading: false,
    appendLoading: false,
    error: null,
    appendError: null,
  };
}

export function startLedgerPage(state: LedgerListState, page: number): LedgerListState {
  if (page === 1) {
    if (state.initialLoading) return state;
    return { ...state, initialLoading: true, error: null, appendError: null };
  }
  if (state.appendLoading) return state;
  return { ...state, appendLoading: true, appendError: null };
}

export function failLedgerPage(
  state: LedgerListState,
  page: number,
  error: string,
): LedgerListState {
  if (page === 1) {
    return { ...state, initialLoading: false, error };
  }
  return { ...state, appendLoading: false, appendError: error };
}

export function resetLedgerFilters(
  _state: LedgerListState,
  filters: LedgerFilters,
): LedgerListState {
  return { ...createLedgerState(filters), initialLoading: true };
}

export function mergeLedgerPage(state: LedgerListState, page: PaginatedLedger): LedgerListState {
  const source = page.page === 1 ? [] : state.items;
  const byId = new Map(source.map((entry) => [entry.id, entry]));
  page.items.forEach((entry) => byId.set(entry.id, entry));
  const items = [...byId.values()];
  return {
    ...state,
    items,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    hasMore: items.length < page.total,
    initialLoading: false,
    appendLoading: false,
    error: null,
    appendError: null,
  };
}
