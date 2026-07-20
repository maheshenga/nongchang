import {
  DEFAULT_TENANT_SETTINGS,
  type TenantSettingsView,
  type UpdateTenantSettingsInput,
} from '@nongchang/shared';

export interface TenantSettingsRow {
  publicCoordinateMode: string;
  brandName: string;
  industryName: string;
  defaultCropName: string;
  workbenchTitle: string;
  defaultBaseLabel: string;
  supportContact: string | null;
}

export function toTenantSettingsView(
  row: TenantSettingsRow | null,
  tenantName: string,
): TenantSettingsView {
  if (!row) {
    return {
      ...DEFAULT_TENANT_SETTINGS,
      brandName: tenantName || DEFAULT_TENANT_SETTINGS.brandName,
    };
  }
  return {
    publicCoordinateMode: row.publicCoordinateMode as TenantSettingsView['publicCoordinateMode'],
    brandName: row.brandName,
    industryName: row.industryName,
    defaultCropName: row.defaultCropName,
    workbenchTitle: row.workbenchTitle,
    defaultBaseLabel: row.defaultBaseLabel,
    supportContact: row.supportContact ?? null,
  };
}

export function buildTenantSettingsUpsertArgs(
  tenantId: string,
  dto: UpdateTenantSettingsInput,
) {
  return {
    where: { tenantId },
    create: { tenantId, ...dto },
    update: { ...dto },
  };
}
