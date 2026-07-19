import {
  idResponseSchema,
  supplyIssueResponseSchema,
  supplyItemSchema,
  type CreateSupplyInput,
  type IssueSupplyInput,
  type SupplyIssueResponse,
  type SupplyItem,
} from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function listSupplies(): Promise<SupplyItem[]> {
  return parseResponse(supplyItemSchema.array(), await request<unknown>('/supplies'), 'supply.list');
}

export async function createSupply(input: CreateSupplyInput): Promise<SupplyItem> {
  return parseResponse(supplyItemSchema, await request<unknown>('/supplies', {
    method: 'POST', body: JSON.stringify(input),
  }), 'supply.create');
}

export async function issueSupply(id: string, input: IssueSupplyInput): Promise<SupplyIssueResponse> {
  return parseResponse(supplyIssueResponseSchema, await request<unknown>(`/supplies/${encodeURIComponent(id)}/issue`, {
    method: 'POST', body: JSON.stringify(input),
  }), 'supply.issue');
}

export async function deleteSupply(id: string): Promise<{ id: string }> {
  return parseResponse(idResponseSchema, await request<unknown>(`/supplies/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }), 'supply.delete');
}
