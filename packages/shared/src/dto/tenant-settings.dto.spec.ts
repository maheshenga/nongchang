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
      supportContact: null,
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

  it('defaults support contact to null and trims bounded values', () => {
    expect(DEFAULT_TENANT_SETTINGS.supportContact).toBeNull();
    expect(tenantSettingsViewSchema.parse({
      ...DEFAULT_TENANT_SETTINGS,
      supportContact: '  sales@example.com / 400-123  ',
    }).supportContact).toBe('sales@example.com / 400-123');
    expect(updateTenantSettingsSchema.parse({ supportContact: null })).toEqual({
      supportContact: null,
    });
    expect(() => updateTenantSettingsSchema.parse({
      supportContact: 'x'.repeat(129),
    })).toThrow();
  });

  it('accepts legacy complete views without support contact as null', () => {
    const legacyView = { ...DEFAULT_TENANT_SETTINGS };
    delete (legacyView as { supportContact?: null }).supportContact;
    expect(tenantSettingsViewSchema.parse(legacyView).supportContact).toBeNull();
  });
});
