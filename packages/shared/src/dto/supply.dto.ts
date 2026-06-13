import { z } from 'zod';

export const supplyItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  total: z.number(),
  used: z.number(),
  remaining: z.number(),
  alert: z.boolean(),
  createdAt: z.string(),
});
export type SupplyItem = z.infer<typeof supplyItemSchema>;

export const createSupplyInputSchema = z.object({
  name: z.string().min(1).max(128),
  unit: z.string().min(1).max(32),
  amount: z.number().positive(),
});
export type CreateSupplyInput = z.infer<typeof createSupplyInputSchema>;

export const issueSupplyInputSchema = z.object({
  batchId: z.string().uuid(),
  amount: z.number().positive(),
});
export type IssueSupplyInput = z.infer<typeof issueSupplyInputSchema>;

export const supplyIssueResponseSchema = z.object({
  supplyId: z.string(),
  used: z.number(),
  remaining: z.number(),
});
export type SupplyIssueResponse = z.infer<typeof supplyIssueResponseSchema>;
