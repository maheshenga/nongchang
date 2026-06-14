import { z } from 'zod';

// ── 快捷模板(一次农事上报的预设)──
// 租户共享:同租户成员共用一套模板;管理在 web 后台,小程序只读使用。
export const quickTemplateInputSchema = z.object({
  name: z.string().min(1).max(32),
  action: z.string().min(1).max(32),
  note: z.string().max(500).optional(),
  cost: z.number().min(0).optional(),
  labor: z.number().min(0).optional(),
  sort: z.number().int().optional(),
});
export type QuickTemplateInput = z.infer<typeof quickTemplateInputSchema>;

export const quickTemplateViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  action: z.string(),
  note: z.string().nullable(),
  cost: z.number().nullable(),
  labor: z.number().nullable(),
  sort: z.number(),
  createdAt: z.string(),
});
export type QuickTemplateView = z.infer<typeof quickTemplateViewSchema>;
