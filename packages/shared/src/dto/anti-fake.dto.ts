import { z } from 'zod';

export const traceScanItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  batchId: z.string(),
  ip: z.string(),
  userAgent: z.string().nullable(),
  scannedAt: z.string(),
});
export type TraceScanItem = z.infer<typeof traceScanItemSchema>;

export const antiFakeAlertSchema = z.object({
  code: z.string(),
  batchId: z.string(),
  distinctIps: z.number(),
  scanCount: z.number(),
  locations: z.array(z.string()),
  lastScanAt: z.string(),
  frozen: z.boolean(),
});
export type AntiFakeAlert = z.infer<typeof antiFakeAlertSchema>;

export const freezeResponseSchema = z.object({
  code: z.string(),
  frozen: z.boolean(),
});
export type FreezeResponse = z.infer<typeof freezeResponseSchema>;
