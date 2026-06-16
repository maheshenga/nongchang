import { z } from 'zod';

export const creditOwnerTypeSchema = z.enum(['PLATFORM', 'AGENT', 'MERCHANT']);
export type CreditOwnerType = z.infer<typeof creditOwnerTypeSchema>;

export const creditResourceSchema = z.enum(['AI', 'CODE']);
export type CreditResource = z.infer<typeof creditResourceSchema>;

export const ledgerReasonSchema = z.enum([
  'RECHARGE', 'ALLOCATE_IN', 'ALLOCATE_OUT', 'CONSUME', 'REFUND',
]);
export type LedgerReason = z.infer<typeof ledgerReasonSchema>;

// 当前用户可见账户的余额摘要。
export const billingSummarySchema = z.object({
  ownerType: creditOwnerTypeSchema,
  ownerId: z.string(),
  aiBalance: z.number(),
  codeBalance: z.number(),
});
export type BillingSummary = z.infer<typeof billingSummarySchema>;

// 下级账户列表项(平台看代理商 / 代理商看商户)。
export const creditAccountItemSchema = z.object({
  id: z.string(),
  ownerType: creditOwnerTypeSchema,
  ownerId: z.string(),
  ownerName: z.string(),
  aiBalance: z.number(),
  codeBalance: z.number(),
});
export type CreditAccountItem = z.infer<typeof creditAccountItemSchema>;

export const creditLedgerItemSchema = z.object({
  id: z.string(),
  resource: creditResourceSchema,
  delta: z.number(),
  balanceAfter: z.number(),
  reason: ledgerReasonSchema,
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type CreditLedgerItem = z.infer<typeof creditLedgerItemSchema>;

export const ledgerQuerySchema = z.object({
  resource: creditResourceSchema.optional(),
  reason: ledgerReasonSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

export const paginatedLedgerSchema = z.object({
  items: z.array(creditLedgerItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type PaginatedLedger = z.infer<typeof paginatedLedgerSchema>;

// 分配额度给下级:转账制。targetOwnerId 为下级 account 的 ownerId。
export const allocateSchema = z.object({
  targetOwnerType: z.enum(['AGENT', 'MERCHANT']),
  targetOwnerId: z.string().min(1),
  resource: creditResourceSchema,
  amount: z.number().int().min(1),
});
export type AllocateInput = z.infer<typeof allocateSchema>;

// 平台充值(仅 system_admin)。
export const rechargeSchema = z.object({
  resource: creditResourceSchema,
  amount: z.number().int().min(1),
});
export type RechargeInput = z.infer<typeof rechargeSchema>;
