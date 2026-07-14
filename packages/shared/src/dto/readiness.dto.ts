import { z } from 'zod';

export const tenantReadinessCodeSchema = z.enum([
  'legal',
  'wechat',
  'oss',
  'map',
  'ai',
  'payment',
  'quota',
  'apiDomain',
  'supportContact',
  'salesContact',
]);

export const tenantReadinessTargetSchema = z.enum([
  'legalSettings',
  'integrations',
  'aiOssSettings',
  'aiProviders',
  'billing',
]);

export const tenantReadinessCheckSchema = z.object({
  code: tenantReadinessCodeSchema,
  label: z.string().min(1),
  ready: z.boolean(),
  target: tenantReadinessTargetSchema.optional(),
}).strict();

export const tenantReadinessViewSchema = z.object({
  ready: z.boolean(),
  checks: z.array(tenantReadinessCheckSchema).length(10),
}).strict();

export type TenantReadinessCode = z.infer<typeof tenantReadinessCodeSchema>;
export type TenantReadinessTarget = z.infer<typeof tenantReadinessTargetSchema>;
export type TenantReadinessCheck = z.infer<typeof tenantReadinessCheckSchema>;
export type TenantReadinessView = z.infer<typeof tenantReadinessViewSchema>;
