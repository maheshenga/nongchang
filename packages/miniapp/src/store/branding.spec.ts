import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';

const getTokenMock = vi.fn();
const fetchTenantSettingsMock = vi.fn();

vi.mock('./auth', () => ({
  getToken: () => getTokenMock(),
}));

vi.mock('../api/tenant-settings', () => ({
  fetchTenantSettings: () => fetchTenantSettingsMock(),
}));

import { clearTenantBranding, getTenantBranding, loadTenantBranding } from './branding';

beforeEach(() => {
  vi.clearAllMocks();
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
