import type {
  CreateTenantDto,
  CreateTenantResponse,
  TenantListItem,
  TenantStatus,
} from '@nongchang/shared';
import { request } from './request';

export function listTenants(): Promise<TenantListItem[]> {
  return request<TenantListItem[]>('/tenants');
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
