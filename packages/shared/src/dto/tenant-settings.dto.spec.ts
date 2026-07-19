import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TENANT_SETTINGS,
  publicCoordinateModeSchema,
  tenantSettingsViewSchema,
  updateTenantSettingsSchema,
} from './tenant-settings.dto';

describe('tenant settings contract', () => {
  it('defaults public coordinates to hidden and copy to generic agriculture terms', () => {
    expect(DEFAULT_TENANT_SETTINGS).toEqual({
      publicCoordinateMode: 'hidden',
      brandName: '农场溯源管理',
      industryName: '农业',
      defaultCropName: '作物',
      workbenchTitle: '农业工作台',
      defaultBaseLabel: '当前基地',
    });
  });

  it('accepts only supported coordinate modes', () => {
    expect(publicCoordinateModeSchema.parse('approximate')).toBe('approximate');
    expect(() => publicCoordinateModeSchema.parse('public')).toThrow();
  });

  it('trims copy and rejects unknown fields', () => {
    expect(updateTenantSettingsSchema.parse({
      brandName: '  云岭农场  ',
      publicCoordinateMode: 'exact',
    })).toEqual({
      brandName: '云岭农场',
      publicCoordinateMode: 'exact',
    });
    expect(() => updateTenantSettingsSchema.parse({ injected: '<script>' })).toThrow();
  });

  it('requires a complete view from the backend', () => {
    expect(tenantSettingsViewSchema.parse(DEFAULT_TENANT_SETTINGS)).toEqual(DEFAULT_TENANT_SETTINGS);
  });
});
