import type { PublicTraceResponse } from '@nongchang/shared';

export class TraceNotFoundError extends Error {}

export async function fetchPublicTrace(code: string): Promise<PublicTraceResponse> {
  const res = await fetch(`/api/public/trace/${encodeURIComponent(code)}`);
  if (res.status === 404) throw new TraceNotFoundError('溯源码无效或不存在');
  if (!res.ok) throw new Error(`溯源查询失败 (${res.status})`);
  return res.json() as Promise<PublicTraceResponse>;
}
