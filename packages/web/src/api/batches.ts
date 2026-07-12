import {
  batchLifecycleViewSchema,
  batchViewSchema,
  type BatchLifecycleView,
  type BatchView,
  type CreateBatchDto,
} from '@nongchang/shared';
import { request } from './request';

export type Batch = BatchView;

export async function listBatches(): Promise<Batch[]> {
  return batchViewSchema.array().parse(await request<unknown>('/batches'));
}

export async function createBatch(dto: CreateBatchDto): Promise<Batch> {
  return batchViewSchema.parse(await request<unknown>('/batches', { method: 'POST', body: JSON.stringify(dto) }));
}

export async function updateBatchStatus(id: string, status: string): Promise<Batch> {
  return batchViewSchema.parse(await request<unknown>(`/batches/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }));
}

export async function updateBatchCost(id: string, dto: { laborCost?: number; sellPrice?: number }): Promise<Batch> {
  return batchViewSchema.parse(await request<unknown>(`/batches/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }));
}

export async function getBatchLifecycle(id: string): Promise<BatchLifecycleView> {
  return batchLifecycleViewSchema.parse(await request<unknown>(`/batches/${id}/lifecycle`));
}

export function deleteBatch(id: string, force = false): Promise<{ id: string }> {
  const qs = force ? '?force=true' : '';
  return request<{ id: string }>(`/batches/${encodeURIComponent(id)}${qs}`, { method: 'DELETE' });
}
