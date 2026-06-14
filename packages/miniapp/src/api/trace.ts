import { request } from './request';

export interface TraceEvent {
  type: string;
  title: string;
  actor?: string | null;
  location?: string | null;
  occurredAt?: string | null;
  payload?: Record<string, unknown> | null;
}

export function listTraceEvents(batchId: string): Promise<TraceEvent[]> {
  return request<TraceEvent[]>({ url: `/trace/events/${batchId}` });
}
