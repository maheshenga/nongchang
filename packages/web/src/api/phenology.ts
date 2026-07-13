import {
  batchDeviationSchema,
  cropPhenologyItemSchema,
  idResponseSchema,
  type BatchDeviation,
  type CreateCropPhenologyDto,
  type CropPhenologyItem,
  type UpdateCropPhenologyDto,
} from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function listPhenologies(): Promise<CropPhenologyItem[]> {
  return parseResponse(cropPhenologyItemSchema.array(), await request<unknown>('/phenologies'), 'phenology.list');
}
export async function createPhenology(dto: CreateCropPhenologyDto): Promise<CropPhenologyItem> {
  return parseResponse(cropPhenologyItemSchema, await request<unknown>('/phenologies', {
    method: 'POST', body: JSON.stringify(dto),
  }), 'phenology.create');
}
export async function updatePhenology(id: string, dto: UpdateCropPhenologyDto): Promise<CropPhenologyItem> {
  return parseResponse(cropPhenologyItemSchema, await request<unknown>(`/phenologies/${id}`, {
    method: 'PATCH', body: JSON.stringify(dto),
  }), 'phenology.update');
}
export async function deletePhenology(id: string): Promise<{ id: string }> {
  return parseResponse(idResponseSchema, await request<unknown>(`/phenologies/${id}`, { method: 'DELETE' }), 'phenology.delete');
}
export async function listDeviations(): Promise<BatchDeviation[]> {
  return parseResponse(batchDeviationSchema.array(), await request<unknown>('/phenologies/deviations'), 'phenology.deviations');
}
