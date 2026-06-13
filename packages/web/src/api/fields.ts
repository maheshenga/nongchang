import type { CreateFieldDto } from '@nongchang/shared';
import { request } from './request';

export interface Field {
  id: string;
  tenantId: string;
  ownerId: string;
  name: string;
  area: number;
  iotDeviceId: string | null;
  createdAt: string;
}

export function listFields(): Promise<Field[]> {
  return request<Field[]>('/fields');
}

export function createField(dto: CreateFieldDto): Promise<Field> {
  return request<Field>('/fields', { method: 'POST', body: JSON.stringify(dto) });
}
