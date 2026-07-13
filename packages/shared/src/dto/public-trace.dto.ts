import { z } from 'zod';
import { BatchStatus, TraceEventType } from '../enums';
import { publicTraceCredentialSchema } from './trace-credential.dto';

export const PUBLIC_TRACE_EVENT_LIMIT = 100;
export const PUBLIC_TRACE_CREDENTIAL_LIMIT = 20;
export const PUBLIC_TRACE_CACHE_TTL_MS = 30_000;

export const publicTraceEventSchema = z.object({
  type: z.enum([
    TraceEventType.ORIGIN, TraceEventType.FARM, TraceEventType.HARVEST,
    TraceEventType.WAREHOUSE, TraceEventType.LOGISTICS, TraceEventType.RETAIL,
  ]),
  title: z.string(),
  actor: z.string(),
  location: z.string(),
  occurredAt: z.string(),
  payload: z.record(z.unknown()).nullable(),
});
export type PublicTraceEvent = z.infer<typeof publicTraceEventSchema>;

export const publicTraceBatchSchema = z.object({
  cropName: z.string(),
  batchNo: z.string(),
  merchantName: z.string().min(1),
  plantDate: z.string(),
  expectedHarvest: z.string(),
  status: z.enum([
    BatchStatus.PLANTING, BatchStatus.GROWING, BatchStatus.HARVESTED, BatchStatus.DISTRIBUTED,
  ]),
  fieldName: z.string(),
  region: z.string().nullable(),
  fieldLng: z.number().nullable(),
  fieldLat: z.number().nullable(),
});
export type PublicTraceBatch = z.infer<typeof publicTraceBatchSchema>;

export const publicTraceResponseSchema = z.object({
  code: z.string(),
  frozen: z.literal(false),
  scanCount: z.number(),
  tiandituKey: z.string().nullable(),
  batch: publicTraceBatchSchema,
  events: z.array(publicTraceEventSchema),
  eventTotal: z.number().int().nonnegative(),
  credentials: z.array(publicTraceCredentialSchema).default([]),
  credentialTotal: z.number().int().nonnegative(),
});
export type PublicTraceResponse = z.infer<typeof publicTraceResponseSchema>;

export const frozenTraceResponseSchema = z.object({
  code: z.string(),
  frozen: z.literal(true),
});
export type FrozenTraceResponse = z.infer<typeof frozenTraceResponseSchema>;

export type PublicTraceResult = PublicTraceResponse | FrozenTraceResponse;
