import type { CreateTraceEventDto, PublicTraceResponse } from '@nongchang/shared';
import { request } from './request';

export class TraceNotFoundError extends Error {}

export async function fetchPublicTrace(code: string): Promise<PublicTraceResponse> {
  const res = await fetch(`/api/public/trace/${encodeURIComponent(code)}`);
  if (res.status === 404) throw new TraceNotFoundError('溯源码无效或不存在');
  if (!res.ok) throw new Error(`溯源查询失败 (${res.status})`);
  return res.json() as Promise<PublicTraceResponse>;
}

export interface TraceCode {
  id: string;
  tenantId: string;
  batchId: string;
  code: string;
  scanCount: number;
  createdAt: string;
}

export interface TraceEvent {
  id: string;
  tenantId: string;
  batchId: string;
  type: string;
  title: string;
  actor: string;
  location: string;
  occurredAt: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export function generateCode(batchId: string): Promise<TraceCode> {
  return request<TraceCode>(`/trace/codes/${encodeURIComponent(batchId)}`, { method: 'POST' });
}

export function listEvents(batchId: string): Promise<TraceEvent[]> {
  return request<TraceEvent[]>(`/trace/events/${encodeURIComponent(batchId)}`);
}

export function createEvent(dto: CreateTraceEventDto): Promise<TraceEvent> {
  return request<TraceEvent>('/trace/events', { method: 'POST', body: JSON.stringify(dto) });
}
