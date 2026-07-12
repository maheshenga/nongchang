import {
  farmRecordViewSchema,
  paginatedFarmRecordViewSchema,
  type CreateFarmRecordDto,
  type FarmRecordView,
  type PaginatedFarmRecordView,
  type UpdateFarmRecordStatusDto,
} from '@nongchang/shared';
import { request } from './request';

export type FarmRecord = FarmRecordView;

export interface ListFarmRecordsQuery {
  batchId?: string;
  action?: string;
  status?: 'pending' | 'completed';
  page?: number;
  pageSize?: number;
}

// 返回完整分页结构(items/total/page/pageSize),供需要分页/过滤的调用方使用。
export async function listFarmRecordsPaged(query: ListFarmRecordsQuery = {}): Promise<PaginatedFarmRecordView> {
  const params = new URLSearchParams();
  if (query.batchId) params.set('batchId', query.batchId);
  if (query.action) params.set('action', query.action);
  if (query.status) params.set('status', query.status);
  if (query.page != null) params.set('page', String(query.page));
  if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  return paginatedFarmRecordViewSchema.parse(await request<unknown>(`/farm-records${qs ? `?${qs}` : ''}`));
}

// 看板视图无分页 UI,默认取最大单页(100)以保留原"展示全部"行为。
export async function listFarmRecords(query: ListFarmRecordsQuery = {}): Promise<FarmRecord[]> {
  const res = await listFarmRecordsPaged({ pageSize: 100, ...query });
  return res.items;
}

export async function createFarmRecord(dto: CreateFarmRecordDto): Promise<FarmRecord> {
  return farmRecordViewSchema.parse(await request<unknown>('/farm-records', { method: 'POST', body: JSON.stringify(dto) }));
}

// 状态流转:待执行 → 已完成。PATCH /farm-records/:id/status。
export async function updateFarmRecordStatus(id: string, status: UpdateFarmRecordStatusDto['status']): Promise<FarmRecord> {
  return farmRecordViewSchema.parse(await request<unknown>(`/farm-records/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }));
}
