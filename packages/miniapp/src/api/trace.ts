import { request } from './request';
import { traceEventViewSchema, type TraceEventView } from '@nongchang/shared';

export type TraceEvent = TraceEventView;

export async function listTraceEvents(batchId: string): Promise<TraceEvent[]> {
  return traceEventViewSchema.array().parse(await request<unknown>({ url: `/trace/events/${batchId}` }));
}
