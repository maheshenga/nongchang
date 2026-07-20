import { describe, expect, it } from 'vitest';
import { DEFAULT_TENANT_SETTINGS } from '@nongchang/shared';
import { buildTenantSettingsUpsertArgs, toTenantSettingsView } from './tenant-settings.model';

describe('tenant settings model', () => {
  it('uses the tenant name and generic defaults when no settings row exists', () => {
    expect(toTenantSettingsView(null, '云岭农业')).toEqual({
      ...DEFAULT_TENANT_SETTINGS,
      brandName: '云岭农业',
    });
  });

  it('normalizes a persisted row into the public view', () => {
    expect(toTenantSettingsView({
      publicCoordinateMode: 'approximate',
      brandName: '云岭农业',
      industryName: '种植业',
      defaultCropName: '葡萄',
      workbenchTitle: '云岭工作台',
      defaultBaseLabel: '一号基地',
      supportContact: 'support@example.com',
    }, 'ignored')).toEqual({
      publicCoordinateMode: 'approximate',
      brandName: '云岭农业',
      industryName: '种植业',
      defaultCropName: '葡萄',
      workbenchTitle: '云岭工作台',
      defaultBaseLabel: '一号基地',
      supportContact: 'support@example.com',
    });
  });

  it('builds a tenant-scoped partial upsert without overwriting omitted fields', () => {
    expect(buildTenantSettingsUpsertArgs('t1', {
      defaultCropName: '葡萄',
      publicCoordinateMode: 'exact',
    })).toEqual({
      where: { tenantId: 't1' },
      create: {
        tenantId: 't1',
        defaultCropName: '葡萄',
        publicCoordinateMode: 'exact',
      },
      update: {
        defaultCropName: '葡萄',
        publicCoordinateMode: 'exact',
      },
    });
  });
});
