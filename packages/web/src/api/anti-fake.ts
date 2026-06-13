import type { TraceScanItem, AntiFakeAlert, FreezeResponse } from '@nongchang/shared';
import { request } from './request';

export function listScans(): Promise<TraceScanItem[]> {
  return request<TraceScanItem[]>('/anti-fake/scans?limit=50');
}

export function listAlerts(): Promise<AntiFakeAlert[]> {
  return request<AntiFakeAlert[]>('/anti-fake/alerts');
}

export function freezeCode(code: string): Promise<FreezeResponse> {
  return request<FreezeResponse>(`/anti-fake/codes/${encodeURIComponent(code)}/freeze`, { method: 'POST' });
}

export function unfreezeCode(code: string): Promise<FreezeResponse> {
  return request<FreezeResponse>(`/anti-fake/codes/${encodeURIComponent(code)}/unfreeze`, { method: 'POST' });
}
