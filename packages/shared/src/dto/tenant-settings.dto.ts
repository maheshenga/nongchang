import { z } from 'zod';

export const publicCoordinateModeSchema = z.enum(['hidden', 'approximate', 'exact']);
export type PublicCoordinateMode = z.infer<typeof publicCoordinateModeSchema>;

const tenantSettingCopySchema = z.string().trim().min(1).max(64);

export const DEFAULT_TENANT_SETTINGS = {
  publicCoordinateMode: 'hidden',
  brandName: '农场溯源管理',
  industryName: '农业',
  defaultCropName: '作物',
  workbenchTitle: '农业工作台',
  defaultBaseLabel: '当前基地',
} as const;

export const tenantSettingsViewSchema = z.object({
  publicCoordinateMode: publicCoordinateModeSchema,
  brandName: tenantSettingCopySchema,
  industryName: tenantSettingCopySchema,
  defaultCropName: tenantSettingCopySchema,
  workbenchTitle: tenantSettingCopySchema,
  defaultBaseLabel: tenantSettingCopySchema,
}).strict();
export type TenantSettingsView = z.infer<typeof tenantSettingsViewSchema>;

export const updateTenantSettingsSchema = tenantSettingsViewSchema.partial().strict();
export type UpdateTenantSettingsInput = z.infer<typeof updateTenantSettingsSchema>;
