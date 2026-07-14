import {
  publicLegalResponseSchema,
  type PublicLegalQuery,
  type PublicLegalResponse,
} from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function getPublicLegal(query: PublicLegalQuery): Promise<PublicLegalResponse> {
  const params = [
    query.tenantCode ? `tenantCode=${encodeURIComponent(query.tenantCode)}` : '',
    query.appId ? `appId=${encodeURIComponent(query.appId)}` : '',
  ].filter(Boolean).join('&');
  return parseResponse(
    publicLegalResponseSchema,
    await request<unknown>({ url: `/public/legal?${params}`, auth: false }),
    'legal.public',
  );
}
