import type { CreateTraceEventDto, PublicTraceResult } from '@nongchang/shared';
import { request } from './request';

export class TraceNotFoundError extends Error {}

export async function fetchPublicTrace(code: string): Promise<PublicTraceResult> {
  const res = await fetch(`/api/public/trace/${encodeURIComponent(code)}`);
  if (res.status === 404) throw new TraceNotFoundError('溯源码无效或不存在');
  if (!res.ok) throw new Error(`溯源查询失败 (${res.status})`);
  return res.json() as Promise<PublicTraceResult>;
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

// 一物一码:为批次批量生成 count 个唯一溯源码,返回码列表。
export function createTraceGenerationRequestKey(source: string, batchId: string, count: number): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${source}:${batchId}:${count}:${random}`;
}

export function generateCodes(batchId: string, count: number, requestKey: string): Promise<TraceCode[]> {
  const normalizedRequestKey = requestKey.trim();
  if (!normalizedRequestKey) throw new Error('Missing trace generation request key');
  return request<TraceCode[]>(`/trace/codes/${encodeURIComponent(batchId)}?count=${encodeURIComponent(count)}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': normalizedRequestKey },
  });
}

export function listEvents(batchId: string): Promise<TraceEvent[]> {
  return request<TraceEvent[]>(`/trace/events/${encodeURIComponent(batchId)}`);
}

// 列出批次已生成的全部溯源码(含各自扫码次数)。
export function listCodes(batchId: string): Promise<TraceCode[]> {
  return request<TraceCode[]>(`/trace/codes/${encodeURIComponent(batchId)}`);
}

export function createEvent(dto: CreateTraceEventDto): Promise<TraceEvent> {
  return request<TraceEvent>('/trace/events', { method: 'POST', body: JSON.stringify(dto) });
}
