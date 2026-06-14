import { request, uploadFile } from './request';
import type { CreateFarmRecordDto, SupplyItem } from '@nongchang/shared';

// 后端实体类型未在 shared 导出,这里按 GET 响应声明所需字段。
export interface Batch {
  id: string; ownerId: string; fieldId: string; batchNo: string;
  cropName: string; plantDate: string; expectedHarvest: string; status: string;
}
export interface FarmRecord {
  id: string; batchId: string; fieldId: string; action: string;
  detail?: Record<string, unknown> | null; images?: string[] | null;
  location?: string | null; recordedAt: string; source: string;
}

export function listBatches(): Promise<Batch[]> {
  return request<Batch[]>({ url: '/batches' });
}

// 扫码回填:按溯源码解析批次(后端校验归属),用于「记一笔」扫码自动选批次。
export function findBatchByCode(code: string): Promise<Batch> {
  return request<Batch>({ url: `/batches/by-code/${encodeURIComponent(code)}` });
}

// 后端 GET /api/farm-records 返回该 owner 全部记录,无 batchId 参数,客户端过滤。
export async function listFarmRecords(batchId: string): Promise<FarmRecord[]> {
  const all = await request<FarmRecord[]>({ url: '/farm-records' });
  return all.filter(r => r.batchId === batchId);
}

export function createFarmRecord(dto: CreateFarmRecordDto): Promise<FarmRecord> {
  return request<FarmRecord>({ url: '/farm-records', method: 'POST', data: dto });
}

export function listSupplies(): Promise<SupplyItem[]> {
  return request<SupplyItem[]>({ url: '/supplies' });
}

export function uploadImage(filePath: string): Promise<string> {
  return uploadFile(filePath);
}

export interface Field {
  id: string; ownerId: string; name: string; area: number;
  lng: number; lat: number; iotDeviceId?: string | null;
}
export function listFields(): Promise<Field[]> {
  return request<Field[]>({ url: '/fields' });
}
