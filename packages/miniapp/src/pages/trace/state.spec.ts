import { describe, expect, it } from 'vitest';
import type { TraceEvent } from '../../api/trace';
import {
  beginTraceRequest,
  canRenderTraceResult,
  completeTraceRequest,
  createTraceViewState,
  failTraceRequest,
} from './state';

const NOW = '2026-07-13T00:00:00.000Z';

function event(id: string, batchId: string): TraceEvent {
  return {
    id,
    tenantId: 'tenant-1',
    batchId,
    type: 'farm',
    title: '施肥',
    actor: '张三',
    location: '一号地',
    occurredAt: NOW,
    payload: null,
    createdAt: NOW,
  };
}

describe('trace request state', () => {
  it('ignores a stale response after the selected batch changes', () => {
    const first = beginTraceRequest(createTraceViewState(), 'batch-a');
    const second = beginTraceRequest(first.state, 'batch-b');

    const stale = completeTraceRequest(second.state, first.token, [event('event-a', 'batch-a')]);

    expect(stale).toEqual(second.state);
    expect(stale.events).toEqual([]);
    expect(stale.selectedBatchId).toBe('batch-b');
  });

  it('clears the previous batch events as soon as another request begins', () => {
    const first = beginTraceRequest(createTraceViewState(), 'batch-a');
    const loaded = completeTraceRequest(first.state, first.token, [event('event-a', 'batch-a')]);

    const next = beginTraceRequest(loaded, 'batch-b');

    expect(next.state).toMatchObject({
      selectedBatchId: 'batch-b',
      status: 'loading',
      events: [],
      error: null,
    });
    expect(canRenderTraceResult(next.state, 'batch-b')).toBe(false);
  });

  it('ignores stale failures and renders only a successful current batch', () => {
    const first = beginTraceRequest(createTraceViewState(), 'batch-a');
    const second = beginTraceRequest(first.state, 'batch-b');
    const staleFailure = failTraceRequest(second.state, first.token, '旧请求失败');
    const loaded = completeTraceRequest(staleFailure, second.token, [event('event-b', 'batch-b')]);

    expect(staleFailure).toEqual(second.state);
    expect(canRenderTraceResult(loaded, 'batch-b')).toBe(true);
    expect(canRenderTraceResult(loaded, 'batch-a')).toBe(false);
  });
});
