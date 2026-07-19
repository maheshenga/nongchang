import {
  tenantSettingsViewSchema,
  updateTenantSettingsSchema,
  type TenantSettingsView,
  type UpdateTenantSettingsInput,
} from '@nongchang/shared';
import { request } from './request';

export async function fetchTenantSettings(): Promise<TenantSettingsView> {
  return tenantSettingsViewSchema.parse(await request<unknown>('/tenant-settings'));
}

export async function saveTenantSettings(input: UpdateTenantSettingsInput): Promise<TenantSettingsView> {
  const dto = updateTenantSettingsSchema.parse(input);
  return tenantSettingsViewSchema.parse(await request<unknown>('/tenant-settings', {
    method: 'PUT',
    body: JSON.stringify(dto),
  }));
}
