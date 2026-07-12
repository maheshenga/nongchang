import { request, uploadFile } from './request';
import {
  batchViewSchema,
  farmRecordViewSchema,
  fieldViewSchema,
  paginatedFarmRecordViewSchema,
  type BatchView,
  type CreateFarmRecordDto,
  type FarmRecordView,
  type FieldView,
  type SupplyItem,
} from '@nongchang/shared';

// 农场资源响应统一由 shared 的运行时契约校验。
export type Batch = BatchView;
export type FarmRecord = FarmRecordView;

export async function listBatches(): Promise<Batch[]> {
  return batchViewSchema.array().parse(await request<unknown>({ url: '/batches' }));
}

// 扫码回填:按溯源码解析批次(后端校验归属),用于「记一笔」扫码自动选批次。
export async function findBatchByCode(code: string): Promise<Batch> {
  return batchViewSchema.parse(await request<unknown>({ url: `/batches/by-code/${encodeURIComponent(code)}` }));
}

// 后端 GET /api/farm-records 支持 batchId 服务端过滤 + 分页,返回 {items,total,page,pageSize}。
export async function listFarmRecords(batchId: string): Promise<FarmRecord[]> {
  const result = await request<unknown>({
    url: `/farm-records?batchId=${encodeURIComponent(batchId)}&pageSize=100`,
  });
  return paginatedFarmRecordViewSchema.parse(result).items;
}

export async function createFarmRecord(dto: CreateFarmRecordDto): Promise<FarmRecord> {
  return farmRecordViewSchema.parse(await request<unknown>({ url: '/farm-records', method: 'POST', data: dto }));
}

export function listSupplies(): Promise<SupplyItem[]> {
  return request<SupplyItem[]>({ url: '/supplies' });
}

export function uploadImage(filePath: string): Promise<string> {
  return uploadFile(filePath);
}

export type Field = FieldView;
export async function listFields(): Promise<Field[]> {
  return fieldViewSchema.array().parse(await request<unknown>({ url: '/fields' }));
}
