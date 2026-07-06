import { z } from 'zod';

export const creditOwnerTypeSchema = z.enum(['PLATFORM', 'AGENT', 'MERCHANT']);
export type CreditOwnerType = z.infer<typeof creditOwnerTypeSchema>;

export const creditResourceSchema = z.enum(['AI', 'CODE']);
export type CreditResource = z.infer<typeof creditResourceSchema>;

export const ledgerReasonSchema = z.enum([
  'RECHARGE', 'ALLOCATE_IN', 'ALLOCATE_OUT', 'CONSUME', 'REFUND', 'PURCHASE',
  'RESERVED', 'CONFIRMED', 'RELEASED',
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

export const orderStatusSchema = z.enum(['PENDING', 'PAID', 'CANCELLED']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

// 售卖套餐管理(SYSTEM_ADMIN)。isUnit=true 表示自定义数量的单价基准套餐。
export const createCreditPlanSchema = z.object({
  name: z.string().min(1).max(64),
  resource: creditResourceSchema,
  quantity: z.number().int().min(1),
  priceCents: z.number().int().min(0),
  isUnit: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type CreateCreditPlanInput = z.infer<typeof createCreditPlanSchema>;

export const updateCreditPlanSchema = createCreditPlanSchema.partial();
export type UpdateCreditPlanInput = z.infer<typeof updateCreditPlanSchema>;

export const creditPlanViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  resource: creditResourceSchema,
  quantity: z.number(),
  priceCents: z.number(),
  isUnit: z.boolean(),
  active: z.boolean(),
  createdAt: z.string(),
});
export type CreditPlanView = z.infer<typeof creditPlanViewSchema>;

// 下单:选固定套餐(planId)或自定义数量(resource+quantity,按单价基准计价)。二者择一。
export const createOrderSchema = z.object({
  planId: z.string().min(1).optional(),
  resource: creditResourceSchema.optional(),
  quantity: z.number().int().min(1).optional(),
}).refine(
  (d) => (d.planId != null) !== (d.resource != null && d.quantity != null),
  { message: '请选择套餐,或指定自定义资源与数量(二者择一)' },
);
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const creditOrderViewSchema = z.object({
  id: z.string(),
  ownerType: creditOwnerTypeSchema,
  ownerId: z.string(),
  planId: z.string().nullable(),
  planName: z.string().nullable(),
  resource: creditResourceSchema,
  quantity: z.number(),
  amountCents: z.number(),
  status: orderStatusSchema,
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});
export type CreditOrderView = z.infer<typeof creditOrderViewSchema>;

export const orderQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OrderQuery = z.infer<typeof orderQuerySchema>;

export const paginatedOrdersSchema = z.object({
  items: z.array(creditOrderViewSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type PaginatedOrders = z.infer<typeof paginatedOrdersSchema>;

// ── 支付宝支付 ──

// 支付宝应用配置写入(SYSTEM_ADMIN)。私钥/公钥为 PEM 文本;更新时留空表示沿用旧值。
export const alipayConfigSchema = z.object({
  appId: z.string().min(1).max(64),
  privateKey: z.string().optional(),        // 应用私钥(PEM),首次必填
  alipayPublicKey: z.string().optional(),   // 支付宝公钥(PEM),首次必填
  enabled: z.boolean().default(false),
});
export type AlipayConfigInput = z.infer<typeof alipayConfigSchema>;

// 配置回显:私钥/公钥仅回掩码,绝不回明文。
export const alipayConfigViewSchema = z.object({
  appId: z.string().nullable(),
  privateKeyMasked: z.string().nullable(),
  alipayPublicKeyMasked: z.string().nullable(),
  enabled: z.boolean(),
});
export type AlipayConfigView = z.infer<typeof alipayConfigViewSchema>;

// 发起支付:对某订单按渠道(PC 网站 / H5)生成支付宝支付入口。
export const payChannelSchema = z.enum(['PC', 'WAP']);
export type PayChannel = z.infer<typeof payChannelSchema>;

export const createPaymentSchema = z.object({
  orderId: z.string().min(1),
  channel: payChannelSchema,
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

// 支付入口:PC 返回需跳转的支付 URL;WAP 返回可直接渲染提交的表单 HTML。二者择一非空。
export const paymentViewSchema = z.object({
  orderId: z.string(),
  channel: payChannelSchema,
  payUrl: z.string().nullable(),    // PC:浏览器跳转该 URL
  formHtml: z.string().nullable(),  // WAP:将该 HTML 写入页面自动提交
});
export type PaymentView = z.infer<typeof paymentViewSchema>;
