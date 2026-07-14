import type { LegalPublicationSummary, PublicLegalResponse } from '@nongchang/shared';

export interface LegalPublicationRow {
  id: string;
  tenantId: string;
  operatorName: string;
  contactAddress: string;
  privacyContact: string;
  contactPhone: string | null;
  contactEmail: string | null;
  privacyVersion: string;
  agreementVersion: string;
  effectiveDate: Date;
  privacyPolicyText: string;
  userAgreementText: string;
  publishedAt: Date;
}

export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toPublicationSummary(row: LegalPublicationRow): LegalPublicationSummary {
  return {
    id: row.id,
    privacyVersion: row.privacyVersion,
    agreementVersion: row.agreementVersion,
    effectiveDate: toDateOnly(row.effectiveDate),
    publishedAt: row.publishedAt.toISOString(),
  };
}

export function toPublicLegal(row: LegalPublicationRow): PublicLegalResponse {
  return {
    configured: true,
    tenantId: row.tenantId,
    publicationId: row.id,
    operatorName: row.operatorName,
    contactAddress: row.contactAddress,
    privacyContact: row.privacyContact,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    privacyVersion: row.privacyVersion,
    agreementVersion: row.agreementVersion,
    effectiveDate: toDateOnly(row.effectiveDate),
    privacyPolicyText: row.privacyPolicyText,
    userAgreementText: row.userAgreementText,
    publishedAt: row.publishedAt.toISOString(),
  };
}
