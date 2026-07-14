import type { ConfiguredPublicLegal, PublicLegalQuery } from '@nongchang/shared';

export const consentKey = (legal: ConfiguredPublicLegal | null): string | null =>
  legal ? `${legal.tenantId}:${legal.publicationId}` : null;

export const shouldResetConsent = (
  previous: ConfiguredPublicLegal | null,
  next: ConfiguredPublicLegal | null,
): boolean => consentKey(previous) !== consentKey(next);

export function buildLegalDocumentUrl(
  kind: 'privacy' | 'agreement',
  query: PublicLegalQuery,
): string {
  const params = [`type=${encodeURIComponent(kind)}`];
  if (query.tenantCode) params.push(`tenantCode=${encodeURIComponent(query.tenantCode)}`);
  if (query.appId) params.push(`appId=${encodeURIComponent(query.appId)}`);
  return `/pages/legal/index?${params.join('&')}`;
}
