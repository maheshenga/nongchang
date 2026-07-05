import { z } from 'zod';
import { BatchStatus, FarmRecordSource, Role, TraceEventType } from '../enums';

export const createUserSchema = z.object({
  username: z.string().min(3).max(64),
  role: z.enum([Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT]),
  agentId: z.string().uuid().nullable().optional(),
  phone: z.string().max(20).optional(),
  displayName: z.string().max(64),
}).strict();
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const createAgentSchema = z.object({
  name: z.string().min(1).max(128),
  region: z.string().max(64),
});
export type CreateAgentDto = z.infer<typeof createAgentSchema>;

export const createFieldSchema = z.object({
  ownerId: z.string().uuid(),
  name: z.string().min(1).max(128),
  area: z.number().positive(),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  iotDeviceId: z.string().max(64).nullable().optional(),
});
export type CreateFieldDto = z.infer<typeof createFieldSchema>;

export const createBatchSchema = z.object({
  ownerId: z.string().uuid(),
  fieldId: z.string().uuid(),
  batchNo: z.string().min(1).max(64),
  cropName: z.string().min(1).max(128),
  plantDate: z.string().datetime(),
  expectedHarvest: z.string().datetime(),
  status: z.enum([BatchStatus.PLANTING, BatchStatus.GROWING, BatchStatus.HARVESTED, BatchStatus.DISTRIBUTED]),
});
export type CreateBatchDto = z.infer<typeof createBatchSchema>;

export const updateBatchStatusSchema = z.object({
  status: z.enum([BatchStatus.PLANTING, BatchStatus.GROWING, BatchStatus.HARVESTED, BatchStatus.DISTRIBUTED]),
});
export type UpdateBatchStatusDto = z.infer<typeof updateBatchStatusSchema>;

export const updateBatchCostSchema = z.object({
  laborCost: z.number().min(0).optional(),
  sellPrice: z.number().min(0).optional(),
}).refine(d => d.laborCost != null || d.sellPrice != null, {
  message: 'laborCost 与 sellPrice 至少提供一项', path: ['laborCost'],
});
export type UpdateBatchCostDto = z.infer<typeof updateBatchCostSchema>;

// 批次列表项:基础批次 + 运行时聚合(防伪码数/累计扫码/投入成本)。
export type BatchListItem = {
  id: string; tenantId: string; ownerId: string; ownerName: string | null; fieldId: string;
  batchNo: string; cropName: string; plantDate: string; expectedHarvest: string;
  status: string; laborCost: number; sellPrice: number; createdAt: string;
  codeCount: number; scanTotal: number; inputCost: number;
};

// 单批次全生命周期下钻聚合。
export type BatchLifecycle = {
  batch: BatchListItem;
  farmRecords: Array<Record<string, unknown>>;
  traceEvents: Array<Record<string, unknown>>;
  codeCount: number; scanTotal: number;
  recentScans: Array<{ scannedAt: string }>;
};

export const createFarmRecordSchema = z.object({
  batchId: z.string().uuid(),
  fieldId: z.string().uuid(),
  action: z.string().min(1).max(128),
  detail: z.record(z.unknown()).optional(),
  images: z.array(z.string().url()).optional(),
  location: z.string().max(128).optional(),
  recordedAt: z.string().datetime(),
  source: z.enum([FarmRecordSource.WEB, FarmRecordSource.MINIAPP, FarmRecordSource.VOICE]),
  status: z.enum(['pending', 'completed']).optional(),
  supplyId: z.string().uuid().optional(),
  supplyAmount: z.number().positive().optional(),
}).refine(d => (d.supplyId == null) === (d.supplyAmount == null), {
  message: 'supplyId 与 supplyAmount 必须同时提供或同时省略',
  path: ['supplyAmount'],
});
export type CreateFarmRecordDto = z.infer<typeof createFarmRecordSchema>;

// 农事记录列表查询:可选按批次过滤 + action 模糊 + status 精确 + 分页。
// query string 全是字符串,用 coerce 转数字。
export const farmRecordQuerySchema = z.object({
  batchId: z.string().uuid().optional(),
  action: z.string().max(128).optional(),
  status: z.enum(['pending', 'completed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type FarmRecordQueryDto = z.infer<typeof farmRecordQuerySchema>;

// 农事记录状态流转:待执行 → 已完成。
export const updateFarmRecordStatusSchema = z.object({
  status: z.enum(['pending', 'completed']),
});
export type UpdateFarmRecordStatusDto = z.infer<typeof updateFarmRecordStatusSchema>;

export type PaginatedFarmRecords<T> = { items: T[]; total: number; page: number; pageSize: number };

export const createTraceEventSchema = z.object({
  batchId: z.string().uuid(),
  type: z.enum([TraceEventType.ORIGIN, TraceEventType.FARM, TraceEventType.HARVEST, TraceEventType.WAREHOUSE, TraceEventType.LOGISTICS, TraceEventType.RETAIL]),
  title: z.string().min(1).max(128),
  actor: z.string().max(128),
  location: z.string().max(128),
  occurredAt: z.string().datetime(),
  payload: z.record(z.unknown()).optional(),
});
export type CreateTraceEventDto = z.infer<typeof createTraceEventSchema>;

// ---- 商户管理(User)更新/状态/列表视图 ----
export const updateUserSchema = z.object({
  displayName: z.string().min(2).max(64).optional(),
  phone: z.string().max(20).nullable().optional(),
});
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const setUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;

export const merchantListItemSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  phone: z.string().nullable(),
  status: z.string(),
  agentId: z.string().nullable(),
  createdAt: z.string(),
  fieldCount: z.number(),
  totalArea: z.number(),
});
export type MerchantListItem = z.infer<typeof merchantListItemSchema>;

export const createUserResponseSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: z.string(),
  agentId: z.string().nullable(),
  displayName: z.string(),
  initialPassword: z.string(),
});
export type CreateUserResponse = z.infer<typeof createUserResponseSchema>;

// ---- 代理商管理(Agent)更新/状态/列表视图 ----
export const updateAgentSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  region: z.string().max(64).optional(),
});
export type UpdateAgentDto = z.infer<typeof updateAgentSchema>;

export const setAgentStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});
export type SetAgentStatusInput = z.infer<typeof setAgentStatusSchema>;

export const agentListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string(),
  status: z.string(),
  createdAt: z.string(),
  merchantCount: z.number(),
});
export type AgentListItem = z.infer<typeof agentListItemSchema>;

// ---- 标准物候模型(CropPhenology):每作物各生长阶段的预设累计天数 ----
export const createCropPhenologySchema = z.object({
  cropName: z.string().min(1).max(128),
  stage: z.string().min(1).max(64),
  expectedDays: z.number().int().min(0),
  sortOrder: z.number().int().min(0).default(0),
});
export type CreateCropPhenologyDto = z.infer<typeof createCropPhenologySchema>;

export const updateCropPhenologySchema = z.object({
  stage: z.string().min(1).max(64).optional(),
  expectedDays: z.number().int().min(0).optional(),
  sortOrder: z.number().int().min(0).optional(),
}).refine(d => d.stage != null || d.expectedDays != null || d.sortOrder != null, {
  message: '至少提供一项更新字段', path: ['stage'],
});
export type UpdateCropPhenologyDto = z.infer<typeof updateCropPhenologySchema>;

export const cropPhenologyItemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  cropName: z.string(),
  stage: z.string(),
  expectedDays: z.number(),
  sortOrder: z.number(),
  createdAt: z.string(),
});
export type CropPhenologyItem = z.infer<typeof cropPhenologyItemSchema>;

// ---- 偏离预警:批次实际进度对比标准物候模型 ----
// elapsedDays:自种植起累计天数;expectedTotalDays:当前批次状态对应阶段的标准累计天数。
// deviationDays = elapsedDays - expectedTotalDays;为正且超阈值=滞后(预警)。
export type BatchDeviation = {
  batchId: string;
  batchNo: string;
  cropName: string;
  status: string;
  plantDate: string;
  elapsedDays: number;
  expectedTotalDays: number | null;
  deviationDays: number | null;
  // 物候模型缺失(该作物未配置)时为 true,无法计算偏离。
  noBaseline: boolean;
  // deviationDays 超过阈值(滞后),需要预警。
  alert: boolean;
};
