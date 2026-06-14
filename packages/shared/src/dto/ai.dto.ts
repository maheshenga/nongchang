import { z } from 'zod';

export const createAiProviderSchema = z.object({
  name: z.string().min(1).max(64),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  textModel: z.string().min(1).max(64),
  visionModel: z.string().max(64).optional(),
  enabled: z.boolean().optional(),
});
export type CreateAiProviderInput = z.infer<typeof createAiProviderSchema>;

// 编辑时 apiKey 可空(空=不改)
export const updateAiProviderSchema = createAiProviderSchema.partial().extend({
  apiKey: z.string().optional(),
});
export type UpdateAiProviderInput = z.infer<typeof updateAiProviderSchema>;

export const aiProviderViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  apiKeyMasked: z.string(),
  textModel: z.string(),
  visionModel: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AiProviderView = z.infer<typeof aiProviderViewSchema>;

export const aiChatSchema = z.object({ message: z.string().min(1).max(2000) });
export type AiChatInput = z.infer<typeof aiChatSchema>;
export type AiChatResponse = { answer: string };

export const aiDiagnoseSchema = z.object({
  imageUrl: z.string().url().optional(),
  imageBase64: z.string().optional(),
  note: z.string().max(500).optional(),
}).refine(d => !!d.imageUrl || !!d.imageBase64, { message: '需提供 imageUrl 或 imageBase64' });
export type AiDiagnoseInput = z.infer<typeof aiDiagnoseSchema>;
export type AiDiagnoseResponse = { result: string };

export const ossConfigSchema = z.object({
  region: z.string().min(1),
  bucket: z.string().min(1),
  accessKeyId: z.string().min(1),
  accessKeySecret: z.string().optional(), // 空=不改
  baseUrl: z.string().url().optional(),
  enabled: z.boolean().optional(),
});
export type OssConfigInput = z.infer<typeof ossConfigSchema>;

export const ossConfigViewSchema = z.object({
  region: z.string(),
  bucket: z.string(),
  accessKeyId: z.string(),
  accessKeySecretMasked: z.string(),
  baseUrl: z.string().nullable(),
  enabled: z.boolean(),
});
export type OssConfigView = z.infer<typeof ossConfigViewSchema>;

export type AiTestResponse = { ok: boolean; latencyMs?: number; error?: string };
