import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TENANT_SETTINGS } from '@nongchang/shared';

const authMock = vi.hoisted(() => ({
  user: { userId: 'u1', tenantId: 'tenant-1', role: 'system_admin' },
  isAuthenticated: true,
}));
const fetchTenantSettingsMock = vi.fn();
const saveTenantSettingsMock = vi.fn();

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    user: authMock.user,
    isAuthenticated: authMock.isAuthenticated,
  }),
}));

vi.mock('../api/tenant-settings', () => ({
  fetchTenantSettings: () => fetchTenantSettingsMock(),
  saveTenantSettings: (...args: unknown[]) => saveTenantSettingsMock(...args),
}));

import { BrandingProvider, useBranding } from './branding-context';

function Probe() {
  const branding = useBranding();
  return <div>{branding.workbenchTitle} / {branding.defaultCropName} / {branding.brandName}</div>;
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.user = { userId: 'u1', tenantId: 'tenant-1', role: 'system_admin' };
  authMock.isAuthenticated = true;
  fetchTenantSettingsMock.mockResolvedValue({
    publicCoordinateMode: 'exact',
    brandName: '云岭农业',
    industryName: '果蔬',
    defaultCropName: '葡萄',
    workbenchTitle: '云岭工作台',
    defaultBaseLabel: '弥勒基地',
  });
});

describe('BrandingProvider', () => {
  it('loads tenant branding for the authenticated identity', async () => {
    render(<BrandingProvider><Probe /></BrandingProvider>);

    expect(await screen.findByText(/云岭工作台/)).toBeTruthy();
    expect(screen.getByText(/葡萄/)).toBeTruthy();
  });

  it('falls back to generic copy when settings cannot be loaded', async () => {
    fetchTenantSettingsMock.mockRejectedValue(new Error('offline'));

    render(<BrandingProvider><Probe /></BrandingProvider>);

    expect(await screen.findByText(new RegExp(DEFAULT_TENANT_SETTINGS.workbenchTitle))).toBeTruthy();
    expect(screen.getByText(new RegExp(DEFAULT_TENANT_SETTINGS.defaultCropName))).toBeTruthy();
  });

  it('resets to defaults for unauthenticated visitors', async () => {
    authMock.isAuthenticated = false;
    authMock.user = null as any;

    render(<BrandingProvider><Probe /></BrandingProvider>);

    await waitFor(() => expect(fetchTenantSettingsMock).not.toHaveBeenCalled());
    expect(screen.getByText(new RegExp(DEFAULT_TENANT_SETTINGS.brandName))).toBeTruthy();
  });
});
