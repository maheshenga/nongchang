import { z } from 'zod';
import { meProfileViewSchema } from './auth.dto';

const isoDateTimeSchema = z.string().datetime();

export const closeAccountSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('password'),
    currentPassword: z.string().min(6).max(128),
    confirmation: z.literal('注销账号'),
  }).strict(),
  z.object({
    method: z.literal('wechat'),
    appId: z.string().min(1).max(128),
    code: z.string().min(1).max(256),
    confirmation: z.literal('注销账号'),
  }).strict(),
]);

export type CloseAccountInput = z.infer<typeof closeAccountSchema>;

export const accountFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  area: z.number(),
  createdAt: isoDateTimeSchema,
}).strict();

export const accountBatchSchema = z.object({
  id: z.string(),
  batchNo: z.string(),
  cropName: z.string(),
  status: z.string(),
  plantDate: isoDateTimeSchema,
  expectedHarvest: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
}).strict();

export const accountFarmRecordSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  fieldId: z.string(),
  action: z.string(),
  detail: z.unknown().nullable(),
  images: z.array(z.string()),
  location: z.string().nullable(),
  recordedAt: isoDateTimeSchema,
  source: z.string(),
  status: z.string(),
  createdAt: isoDateTimeSchema,
}).strict();

export const accountSupplySchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  total: z.number(),
  used: z.number(),
  createdAt: isoDateTimeSchema,
}).strict();

export const accountSupplyIssueSchema = z.object({
  id: z.string(),
  supplyId: z.string(),
  batchId: z.string(),
  amount: z.number(),
  unitPrice: z.number(),
  createdAt: isoDateTimeSchema,
}).strict();

export const accountUploadSchema = z.object({
  id: z.string(),
  purpose: z.string(),
  url: z.string().nullable(),
  sizeBytes: z.string(),
  status: z.string(),
  createdAt: isoDateTimeSchema,
}).strict();

export const accountAiOperationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.string(),
  errorCategory: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict();

export const accountCreditOrderSchema = z.object({
  id: z.string(),
  resource: z.string(),
  quantity: z.number(),
  amountCents: z.number(),
  status: z.string(),
  payChannel: z.string().nullable(),
  paidAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
}).strict();

export const accountCreditLedgerSchema = z.object({
  id: z.string(),
  resource: z.string(),
  delta: z.number(),
  balanceAfter: z.number(),
  reason: z.string(),
  note: z.string().nullable(),
  createdAt: isoDateTimeSchema,
}).strict();

export const accountCreditAccountSchema = z.object({
  aiBalance: z.number(),
  codeBalance: z.number(),
  ledgers: z.array(accountCreditLedgerSchema),
}).strict();

const tenantIdentitySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
}).strict();

const accountCollectionsSchema = z.object({
  fields: z.array(accountFieldSchema),
  batches: z.array(accountBatchSchema),
  farmRecords: z.array(accountFarmRecordSchema),
  supplies: z.array(accountSupplySchema),
  supplyIssues: z.array(accountSupplyIssueSchema),
  uploads: z.array(accountUploadSchema),
  aiOperations: z.array(accountAiOperationSchema),
  creditOrders: z.array(accountCreditOrderSchema),
  creditAccount: accountCreditAccountSchema.nullable(),
}).strict();

const accountCountsSchema = z.object({
  fields: z.number().int().nonnegative(),
  batches: z.number().int().nonnegative(),
  farmRecords: z.number().int().nonnegative(),
  supplies: z.number().int().nonnegative(),
  supplyIssues: z.number().int().nonnegative(),
  uploads: z.number().int().nonnegative(),
  aiOperations: z.number().int().nonnegative(),
  creditOrders: z.number().int().nonnegative(),
  creditLedgers: z.number().int().nonnegative(),
}).strict();

export const accountDataPreviewSchema = z.object({
  generatedAt: isoDateTimeSchema,
  tenant: tenantIdentitySchema,
  account: meProfileViewSchema,
  counts: accountCountsSchema,
  recent: accountCollectionsSchema,
  recentLimit: z.literal(20),
}).strict();

export type AccountDataPreview = z.infer<typeof accountDataPreviewSchema>;

export const accountDataExportSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: isoDateTimeSchema,
  tenant: tenantIdentitySchema,
  account: meProfileViewSchema,
  data: accountCollectionsSchema,
  exclusions: z.array(z.string().min(1)).min(1),
}).strict();

export type AccountDataExport = z.infer<typeof accountDataExportSchema>;
