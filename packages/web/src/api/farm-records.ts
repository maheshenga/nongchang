import type { CreateFarmRecordDto } from '@nongchang/shared';
import { request } from './request';

export interface FarmRecord {
  id: string;
  tenantId: string;
  batchId: string;
  fieldId: string;
  operatorId: string;
  action: string;
  detail: Record<string, unknown> | null;
  images: string[] | null;
  location: string | null;
  recordedAt: string;
  source: string;
  createdAt: string;
}

export function listFarmRecords(): Promise<FarmRecord[]> {
  return request<FarmRecord[]>('/farm-records');
}

export function createFarmRecord(dto: CreateFarmRecordDto): Promise<FarmRecord> {
  return request<FarmRecord>('/farm-records', { method: 'POST', body: JSON.stringify(dto) });
}
