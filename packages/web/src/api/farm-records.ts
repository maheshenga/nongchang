import type { CreateFarmRecordDto, PaginatedFarmRecords } from '@nongchang/shared';
import { request } from './request';

export interface FarmRecord {
  id: string;
  tenantId: string;
  batchId: string;
  fieldId: string;
  operatorId: string;
  ownerName: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  images: string[] | null;
  location: string | null;
  recordedAt: string;
  source: string;
  createdAt: string;
}

export interface ListFarmRecordsQuery {
  batchId?: string;
  page?: number;
  pageSize?: number;
}

// 返回完整分页结构(items/total/page/pageSize),供需要分页/过滤的调用方使用。
export function listFarmRecordsPaged(query: ListFarmRecordsQuery = {}): Promise<PaginatedFarmRecords<FarmRecord>> {
  const params = new URLSearchParams();
  if (query.batchId) params.set('batchId', query.batchId);
  if (query.page != null) params.set('page', String(query.page));
  if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  return request<PaginatedFarmRecords<FarmRecord>>(`/farm-records${qs ? `?${qs}` : ''}`);
}

// 看板视图无分页 UI,默认取最大单页(100)以保留原"展示全部"行为。
export async function listFarmRecords(query: ListFarmRecordsQuery = {}): Promise<FarmRecord[]> {
  const res = await listFarmRecordsPaged({ pageSize: 100, ...query });
  return res.items;
}

export function createFarmRecord(dto: CreateFarmRecordDto): Promise<FarmRecord> {
  return request<FarmRecord>('/farm-records', { method: 'POST', body: JSON.stringify(dto) });
}
