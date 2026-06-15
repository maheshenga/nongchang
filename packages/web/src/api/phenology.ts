import type {
  CropPhenologyItem, CreateCropPhenologyDto, UpdateCropPhenologyDto, BatchDeviation,
} from '@nongchang/shared';
import { request } from './request';

// 标准物候模型 CRUD。
export function listPhenologies(): Promise<CropPhenologyItem[]> {
  return request<CropPhenologyItem[]>('/phenologies');
}

export function createPhenology(dto: CreateCropPhenologyDto): Promise<CropPhenologyItem> {
  return request<CropPhenologyItem>('/phenologies', { method: 'POST', body: JSON.stringify(dto) });
}

export function updatePhenology(id: string, dto: UpdateCropPhenologyDto): Promise<CropPhenologyItem> {
  return request<CropPhenologyItem>(`/phenologies/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

export function deletePhenology(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/phenologies/${id}`, { method: 'DELETE' });
}

// 偏离预警:批次实际进度对比标准物候模型。
export function listDeviations(): Promise<BatchDeviation[]> {
  return request<BatchDeviation[]>('/phenologies/deviations');
}
