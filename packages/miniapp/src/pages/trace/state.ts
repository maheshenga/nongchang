import type { TraceEvent } from '../../api/trace';

export interface TraceRequestToken {
  batchId: string;
  epoch: number;
}

export interface TraceViewState {
  selectedBatchId: string;
  epoch: number;
  status: 'idle' | 'loading' | 'success' | 'error';
  events: TraceEvent[];
  error: string | null;
}

export function createTraceViewState(): TraceViewState {
  return {
    selectedBatchId: '',
    epoch: 0,
    status: 'idle',
    events: [],
    error: null,
  };
}

export function beginTraceRequest(
  state: TraceViewState,
  batchId: string,
  epoch = state.epoch + 1,
): { state: TraceViewState; token: TraceRequestToken } {
  const token = { batchId, epoch };
  return {
    token,
    state: {
      selectedBatchId: batchId,
      epoch: token.epoch,
      status: 'loading',
      events: [],
      error: null,
    },
  };
}

function ownsRequest(state: TraceViewState, token: TraceRequestToken): boolean {
  return state.selectedBatchId === token.batchId && state.epoch === token.epoch;
}

export function completeTraceRequest(
  state: TraceViewState,
  token: TraceRequestToken,
  events: TraceEvent[],
): TraceViewState {
  if (!ownsRequest(state, token)) return state;
  return { ...state, status: 'success', events, error: null };
}

export function failTraceRequest(
  state: TraceViewState,
  token: TraceRequestToken,
  error: string,
): TraceViewState {
  if (!ownsRequest(state, token)) return state;
  return { ...state, status: 'error', events: [], error };
}

export function canRenderTraceResult(state: TraceViewState, batchId: string): boolean {
  return state.status === 'success' && state.selectedBatchId === batchId;
}
