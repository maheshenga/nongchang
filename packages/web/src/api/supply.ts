import type { SupplyItem, CreateSupplyInput, IssueSupplyInput, SupplyIssueResponse } from '@nongchang/shared';
import { request } from './request';

export function listSupplies(): Promise<SupplyItem[]> {
  return request<SupplyItem[]>('/supplies');
}

export function createSupply(input: CreateSupplyInput): Promise<SupplyItem> {
  return request<SupplyItem>('/supplies', { method: 'POST', body: JSON.stringify(input) });
}

export function issueSupply(id: string, input: IssueSupplyInput): Promise<SupplyIssueResponse> {
  return request<SupplyIssueResponse>(`/supplies/${encodeURIComponent(id)}/issue`, {
    method: 'POST', body: JSON.stringify(input),
  });
}

export function deleteSupply(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/supplies/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
