import type { CreateBatchDto } from '@nongchang/shared';
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
}

export function listBatches(): Promise<Batch[]> {
  return request<Batch[]>('/batches');
}

export function createBatch(dto: CreateBatchDto): Promise<Batch> {
  return request<Batch>('/batches', { method: 'POST', body: JSON.stringify(dto) });
}
