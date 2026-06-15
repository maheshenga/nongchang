import type { CreateBatchDto, BatchLifecycle } from '@nongchang/shared';
import { request } from './request';

export interface Batch {
  id: string;
  tenantId: string;
  ownerId: string;
  fieldId: string;
  batchNo: string;
  cropName: string;
  plantDate: string;
  expectedHarvest: string;
  status: string;
  createdAt: string;
  laborCost: number;
  sellPrice: number;
  codeCount: number;
  scanTotal: number;
  inputCost: number;
}

export function listBatches(): Promise<Batch[]> {
  return request<Batch[]>('/batches');
}

export function createBatch(dto: CreateBatchDto): Promise<Batch> {
  return request<Batch>('/batches', { method: 'POST', body: JSON.stringify(dto) });
}

export function updateBatchStatus(id: string, status: string): Promise<Batch> {
  return request<Batch>(`/batches/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export function updateBatchCost(id: string, dto: { laborCost?: number; sellPrice?: number }): Promise<Batch> {
  return request<Batch>(`/batches/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

export function getBatchLifecycle(id: string): Promise<BatchLifecycle> {
  return request<BatchLifecycle>(`/batches/${id}/lifecycle`);
}

export function deleteBatch(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/batches/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
