import { tenantReadinessViewSchema, type TenantReadinessView } from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function getTenantReadiness(): Promise<TenantReadinessView> {
  return parseResponse(
    tenantReadinessViewSchema,
    await request<unknown>('/readiness/tenant'),
    'readiness.tenant',
  );
}
