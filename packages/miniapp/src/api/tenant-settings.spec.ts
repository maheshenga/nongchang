import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();

vi.mock('./request', () => ({
  request: (...args: unknown[]) => requestMock(...args),
}));

import { fetchTenantSettings, saveTenantSettings } from './tenant-settings';

beforeEach(() => {
  requestMock.mockReset();
});

describe('miniapp tenant settings api', () => {
  it('parses the backend settings payload', async () => {
    requestMock.mockResolvedValue({
      publicCoordinateMode: 'approximate',
      brandName: '云岭农业',
      industryName: '果蔬',
      defaultCropName: '葡萄',
      workbenchTitle: '云岭工作台',
      defaultBaseLabel: '弥勒基地',
    });

    await expect(fetchTenantSettings()).resolves.toMatchObject({
      brandName: '云岭农业',
      defaultCropName: '葡萄',
    });
  });

  it('serializes updates through the shared contract', async () => {
    requestMock.mockResolvedValue({
      publicCoordinateMode: 'hidden',
      brandName: '云岭农业',
      industryName: '果蔬',
      defaultCropName: '葡萄',
      workbenchTitle: '云岭工作台',
      defaultBaseLabel: '弥勒基地',
    });

    await saveTenantSettings({ defaultCropName: ' 葡萄 ', publicCoordinateMode: 'exact' });

    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({
      url: '/tenant-settings',
      method: 'PUT',
    }));
    expect(requestMock.mock.calls[0][0].data).toEqual({
      defaultCropName: '葡萄',
      publicCoordinateMode: 'exact',
    });
  });
});
