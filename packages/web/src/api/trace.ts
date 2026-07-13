import {
  frozenTraceResponseSchema,
  publicTraceResponseSchema,
  traceCodeViewSchema,
  traceEventViewSchema,
  type CreateTraceEventDto,
  type PublicTraceResult,
  type TraceCodeView,
  type TraceEventView,
} from '@nongchang/shared';
import { request } from './request';

export class TraceLookupError extends Error {
  constructor(public kind: 'not-found' | 'network', message: string) {
    super(message);
    this.name = 'TraceLookupError';
  }
}

export async function fetchPublicTrace(code: string): Promise<PublicTraceResult> {
  const normalized = code.trim();
  try {
    const res = await fetch(`/api/public/trace/${encodeURIComponent(normalized)}`);
    if (res.status === 404) throw new TraceLookupError('not-found', '溯源码无效或不存在');
    if (!res.ok) throw new TraceLookupError('network', `溯源查询服务暂不可用 (${res.status})`);
    const payload = await res.json();
    return publicTraceResponseSchema.or(frozenTraceResponseSchema).parse(payload);
  } catch (cause) {
    if (cause instanceof TraceLookupError) throw cause;
    throw new TraceLookupError('network', '网络连接失败，请检查网络后重试');
  }
}

export type TraceCode = TraceCodeView;
export type TraceEvent = TraceEventView;

// 一物一码:为批次批量生成 count 个唯一溯源码,返回码列表。
export function createTraceGenerationRequestKey(source: string, batchId: string, count: number): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${source}:${batchId}:${count}:${random}`;
}

export async function generateCodes(batchId: string, count: number, requestKey: string): Promise<TraceCode[]> {
  const normalizedRequestKey = requestKey.trim();
  if (!normalizedRequestKey) throw new Error('Missing trace generation request key');
  const result = await request<unknown>(`/trace/codes/${encodeURIComponent(batchId)}?count=${encodeURIComponent(count)}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': normalizedRequestKey },
  });
  return traceCodeViewSchema.array().parse(result);
}

export async function listEvents(batchId: string): Promise<TraceEvent[]> {
  return traceEventViewSchema.array().parse(await request<unknown>(`/trace/events/${encodeURIComponent(batchId)}`));
}

// 列出批次已生成的全部溯源码(含各自扫码次数)。
export async function listCodes(batchId: string): Promise<TraceCode[]> {
  return traceCodeViewSchema.array().parse(await request<unknown>(`/trace/codes/${encodeURIComponent(batchId)}`));
}

export async function createEvent(dto: CreateTraceEventDto): Promise<TraceEvent> {
  return traceEventViewSchema.parse(await request<unknown>('/trace/events', { method: 'POST', body: JSON.stringify(dto) }));
}
