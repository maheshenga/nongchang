import type {
  CreateTenantDto,
  CreateTenantResponse,
  ListQuery,
  Paginated,
  TenantListItem,
  TenantStatus,
} from '@nongchang/shared';
import { request } from './request';

function withListQuery(path: string, query: Partial<ListQuery> = {}) {
  const qs = new URLSearchParams();
  if (query.page) qs.set('page', String(query.page));
  if (query.pageSize) qs.set('pageSize', String(query.pageSize));
  const s = qs.toString();
  return `${path}${s ? `?${s}` : ''}`;
}

export function listTenants<T extends Partial<ListQuery> | undefined = undefined>(
  query?: T,
): Promise<T extends undefined ? TenantListItem[] : Paginated<TenantListItem>> {
  return request(withListQuery('/tenants', query ?? {}));
}

export function createTenant(dto: CreateTenantDto): Promise<CreateTenantResponse> {
  return request<CreateTenantResponse>('/tenants', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export function setTenantStatus(id: string, status: TenantStatus): Promise<{ id: string; status: TenantStatus }> {
  return request<{ id: string; status: TenantStatus }>(`/tenants/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}
