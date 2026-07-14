import { z } from 'zod';

const effectiveDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  value => value <= new Date().toISOString().slice(0, 10),
  '生效日期不能晚于今天',
);

const legalDocumentPayloadShape = {
  operatorName: z.string().trim().min(2).max(128),
  contactAddress: z.string().trim().min(2).max(256),
  privacyContact: z.string().trim().min(2).max(64),
  contactPhone: z.string().trim().min(5).max(32).nullable(),
  contactEmail: z.string().trim().email().max(128).nullable(),
  privacyVersion: z.string().trim().min(1).max(32),
  agreementVersion: z.string().trim().min(1).max(32),
  effectiveDate: effectiveDateSchema,
  privacyPolicyText: z.string().min(200).max(50_000),
  userAgreementText: z.string().min(200).max(50_000),
};

export const legalDocumentPayloadSchema = z.object(legalDocumentPayloadShape)
  .strict()
  .refine(value => Boolean(value.contactPhone || value.contactEmail), {
    message: '联系电话和联系邮箱至少填写一项',
    path: ['contactPhone'],
  });

export type LegalDocumentPayload = z.infer<typeof legalDocumentPayloadSchema>;

export const legalPublicationSummarySchema = z.object({
  id: z.string().uuid(),
  privacyVersion: z.string(),
  agreementVersion: z.string(),
  effectiveDate: effectiveDateSchema,
  publishedAt: z.string().datetime(),
}).strict();

export type LegalPublicationSummary = z.infer<typeof legalPublicationSummarySchema>;

export const legalSettingsViewSchema = z.object({
  draft: legalDocumentPayloadSchema.nullable(),
  currentPublication: legalPublicationSummarySchema.nullable(),
}).strict();

export type LegalSettingsView = z.infer<typeof legalSettingsViewSchema>;

export const publicLegalQuerySchema = z.object({
  tenantCode: z.string().trim().min(1).max(64)
    .transform(value => value.toUpperCase())
    .optional(),
  appId: z.string().trim().min(1).max(128).optional(),
}).strict().refine(value => Boolean(value.tenantCode || value.appId), {
  message: 'tenantCode 或 appId 至少提供一项',
});

export type PublicLegalQuery = z.infer<typeof publicLegalQuerySchema>;

const publicLegalUnconfiguredSchema = z.object({
  configured: z.literal(false),
  tenantId: z.string().uuid(),
}).strict();

const publicLegalConfiguredSchema = z.object({
  ...legalDocumentPayloadShape,
  configured: z.literal(true),
  tenantId: z.string().uuid(),
  publicationId: z.string().uuid(),
  publishedAt: z.string().datetime(),
}).strict();

export const publicLegalResponseSchema = z.discriminatedUnion('configured', [
  publicLegalConfiguredSchema,
  publicLegalUnconfiguredSchema,
]);

export type PublicLegalResponse = z.infer<typeof publicLegalResponseSchema>;
export type ConfiguredPublicLegal = Extract<PublicLegalResponse, { configured: true }>;
