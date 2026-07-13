import { z } from 'zod';
import { BatchStatus, FarmRecordSource, TraceEventType } from '../enums';

const id = z.string().min(1);
const dateTime = z.string().datetime();
const jsonRecord = z.record(z.unknown());

export const batchViewSchema = z.object({
  id,
  tenantId: id,
  ownerId: id,
  ownerName: z.string().nullable().default(null),
  fieldId: id,
  batchNo: z.string().min(1),
  cropName: z.string().min(1),
  plantDate: dateTime,
  expectedHarvest: dateTime,
  status: z.enum([
    BatchStatus.PLANTING,
    BatchStatus.GROWING,
    BatchStatus.HARVESTED,
    BatchStatus.DISTRIBUTED,
  ]),
  laborCost: z.number(),
  sellPrice: z.number(),
  createdAt: dateTime,
  codeCount: z.number().int().nonnegative().default(0),
  scanTotal: z.number().int().nonnegative().default(0),
  inputCost: z.number().nonnegative().default(0),
}).strict();
export type BatchView = z.infer<typeof batchViewSchema>;

export const fieldViewSchema = z.object({
  id,
  tenantId: id,
  ownerId: id,
  ownerName: z.string().nullable().default(null),
  name: z.string().min(1),
  area: z.number().nonnegative(),
  lng: z.number().nullable().default(null),
  lat: z.number().nullable().default(null),
  iotDeviceId: z.string().nullable().default(null),
  createdAt: dateTime,
}).strict();
export type FieldView = z.infer<typeof fieldViewSchema>;

export const farmRecordViewSchema = z.object({
  id,
  tenantId: id,
  batchId: id,
  fieldId: id,
  operatorId: id,
  ownerName: z.string().nullable().default(null),
  operatorName: z.string().nullable().default(null),
  action: z.string().min(1),
  detail: jsonRecord.nullable().default(null),
  images: z.array(z.string()).nullable().default(null),
  location: z.string().nullable().default(null),
  recordedAt: dateTime,
  source: z.enum([FarmRecordSource.WEB, FarmRecordSource.MINIAPP, FarmRecordSource.VOICE]),
  status: z.enum(['pending', 'completed']),
  supplyId: z.string().nullable().default(null),
  supplyAmount: z.number().nullable().default(null),
  createdAt: dateTime,
}).strict();
export type FarmRecordView = z.infer<typeof farmRecordViewSchema>;

export const traceCodeViewSchema = z.object({
  id,
  tenantId: id,
  batchId: id,
  code: z.string().min(1),
  scanCount: z.number().int().nonnegative(),
  status: z.string().min(1).default('active'),
  reservationId: z.string().nullable().default(null),
  generationKey: z.string().nullable().default(null),
  createdAt: dateTime,
}).strict();
export type TraceCodeView = z.infer<typeof traceCodeViewSchema>;

export const traceEventViewSchema = z.object({
  id,
  tenantId: id,
  batchId: id,
  type: z.enum([
    TraceEventType.ORIGIN,
    TraceEventType.FARM,
    TraceEventType.HARVEST,
    TraceEventType.WAREHOUSE,
    TraceEventType.LOGISTICS,
    TraceEventType.RETAIL,
  ]),
  title: z.string().min(1),
  actor: z.string(),
  location: z.string(),
  occurredAt: dateTime,
  payload: jsonRecord.nullable().default(null),
  createdAt: dateTime,
}).strict();
export type TraceEventView = z.infer<typeof traceEventViewSchema>;

export const paginatedFarmRecordViewSchema = z.object({
  items: z.array(farmRecordViewSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
}).strict();
export type PaginatedFarmRecordView = z.infer<typeof paginatedFarmRecordViewSchema>;

export const batchLifecycleViewSchema = z.object({
  batch: batchViewSchema,
  farmRecords: z.array(farmRecordViewSchema),
  traceEvents: z.array(traceEventViewSchema),
  codeCount: z.number().int().nonnegative(),
  scanTotal: z.number().int().nonnegative(),
  recentScans: z.array(z.object({ scannedAt: dateTime }).strict()),
}).strict();
export type BatchLifecycleView = z.infer<typeof batchLifecycleViewSchema>;
