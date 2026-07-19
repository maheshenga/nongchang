import { fieldViewSchema, type CreateFieldDto, type FieldView } from '@nongchang/shared';
import { request } from './request';

export type Field = FieldView;

export async function listFields(): Promise<Field[]> {
  return fieldViewSchema.array().parse(await request<unknown>('/fields'));
}

export async function createField(dto: CreateFieldDto): Promise<Field> {
  return fieldViewSchema.parse(await request<unknown>('/fields', { method: 'POST', body: JSON.stringify(dto) }));
}
