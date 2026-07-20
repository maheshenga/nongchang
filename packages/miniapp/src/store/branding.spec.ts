import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { DEFAULT_TENANT_SETTINGS, type TenantSettingsView } from '@nongchang/shared';

const getTokenMock = vi.fn();
const fetchTenantSettingsMock = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

vi.mock('./auth', () => ({
  getToken: () => getTokenMock(),
}));

vi.mock('../api/tenant-settings', () => ({
  fetchTenantSettings: () => fetchTenantSettingsMock(),
}));

import { clearTenantBranding, getTenantBranding, loadTenantBranding } from './branding';

beforeEach(() => {
  vi.resetAllMocks();
  Taro.__reset();
  clearTenantBranding();
  getTokenMock.mockReturnValue('token-a');
});

describe('miniapp branding store', () => {
  it('loads and caches tenant branding', async () => {
    fetchTenantSettingsMock.mockResolvedValue({
      publicCoordinateMode: 'exact',
      brandName: '云岭农业',
      industryName: '果蔬',
      defaultCropName: '葡萄',
      workbenchTitle: '云岭工作台',
      defaultBaseLabel: '弥勒基地',
    });

    await expect(loadTenantBranding()).resolves.toMatchObject({ defaultCropName: '葡萄' });
    expect(getTenantBranding().workbenchTitle).toBe('云岭工作台');
    expect(fetchTenantSettingsMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to defaults when the network fails', async () => {
    fetchTenantSettingsMock.mockRejectedValue(new Error('offline'));

    await expect(loadTenantBranding()).resolves.toMatchObject({ workbenchTitle: '农业工作台' });
    expect(getTenantBranding().defaultCropName).toBe('作物');
  });

  it('force refreshes cached tenant branding', async () => {
    fetchTenantSettingsMock.mockResolvedValueOnce({
      ...DEFAULT_TENANT_SETTINGS,
      supportContact: 'old@example.com',
    });
    await loadTenantBranding();

    fetchTenantSettingsMock.mockResolvedValueOnce({
      ...DEFAULT_TENANT_SETTINGS,
      supportContact: 'new@example.com',
    });
    await loadTenantBranding({ forceRefresh: true });

    expect(fetchTenantSettingsMock).toHaveBeenCalledTimes(2);
    expect(getTenantBranding().supportContact).toBe('new@example.com');
  });

  it('normalizes legacy cached branding without support contact', async () => {
    const legacyBranding = { ...DEFAULT_TENANT_SETTINGS };
    delete (legacyBranding as { supportContact?: null }).supportContact;
    fetchTenantSettingsMock.mockResolvedValue(legacyBranding);

    await loadTenantBranding({ forceRefresh: true });
    await loadTenantBranding();

    expect(getTenantBranding().supportContact).toBeNull();
    expect(fetchTenantSettingsMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the newest concurrent refresh as the global branding', async () => {
    const first = deferred<TenantSettingsView>();
    const second = deferred<TenantSettingsView>();
    fetchTenantSettingsMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const firstLoad = loadTenantBranding({ forceRefresh: true });
    const secondLoad = loadTenantBranding({ forceRefresh: true });
    second.resolve({ ...DEFAULT_TENANT_SETTINGS, supportContact: 'new@example.com' });
    await secondLoad;
    first.resolve({ ...DEFAULT_TENANT_SETTINGS, supportContact: 'old@example.com' });
    await firstLoad;

    expect(getTenantBranding().supportContact).toBe('new@example.com');
  });

  it('clears the previous tenant cache when the token changes', async () => {
    fetchTenantSettingsMock.mockResolvedValueOnce({
      publicCoordinateMode: 'hidden',
      brandName: '云岭农业',
      industryName: '果蔬',
      defaultCropName: '葡萄',
      workbenchTitle: '云岭工作台',
      defaultBaseLabel: '弥勒基地',
    });
    await loadTenantBranding();

    getTokenMock.mockReturnValue('token-b');
    fetchTenantSettingsMock.mockResolvedValueOnce({
      publicCoordinateMode: 'hidden',
      brandName: '北山农业',
      industryName: '粮食',
      defaultCropName: '稻米',
      workbenchTitle: '北山工作台',
      defaultBaseLabel: '北山基地',
    });

    await loadTenantBranding();
    expect(getTenantBranding().brandName).toBe('北山农业');
  });
});
