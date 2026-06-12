import { z } from 'zod';
import { BatchStatus, FarmRecordSource, Role, TraceEventType } from '../enums';

export const createUserSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(128),
  role: z.enum([Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT]),
  agentId: z.string().uuid().nullable().optional(),
  phone: z.string().max(20).optional(),
  displayName: z.string().max(64),
});
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

export const createFarmRecordSchema = z.object({
  batchId: z.string().uuid(),
  fieldId: z.string().uuid(),
  action: z.string().min(1).max(128),
  detail: z.record(z.unknown()).optional(),
  images: z.array(z.string().url()).optional(),
  location: z.string().max(128).optional(),
  recordedAt: z.string().datetime(),
  source: z.enum([FarmRecordSource.WEB, FarmRecordSource.MINIAPP, FarmRecordSource.VOICE]),
});
export type CreateFarmRecordDto = z.infer<typeof createFarmRecordSchema>;

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
