import { z } from 'zod';
import { BatchStatus, TraceEventType } from '../enums';

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
  plantDate: z.string(),
  expectedHarvest: z.string(),
  status: z.enum([
    BatchStatus.PLANTING, BatchStatus.GROWING, BatchStatus.HARVESTED, BatchStatus.DISTRIBUTED,
  ]),
  fieldName: z.string(),
  region: z.string().nullable(),
});
export type PublicTraceBatch = z.infer<typeof publicTraceBatchSchema>;

export const publicTraceResponseSchema = z.object({
  code: z.string(),
  scanCount: z.number(),
  batch: publicTraceBatchSchema,
  events: z.array(publicTraceEventSchema),
});
export type PublicTraceResponse = z.infer<typeof publicTraceResponseSchema>;
