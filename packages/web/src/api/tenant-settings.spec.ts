import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();

vi.mock('./request', () => ({
  request: (...args: unknown[]) => requestMock(...args),
}));

import { fetchTenantSettings, saveTenantSettings } from './tenant-settings';

beforeEach(() => {
  requestMock.mockReset();
});

describe('tenant settings api', () => {
  it('parses the backend tenant settings view', async () => {
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
      publicCoordinateMode: 'approximate',
    });
    expect(requestMock).toHaveBeenCalledWith('/tenant-settings');
  });

  it('saves only the shared update contract', async () => {
    requestMock.mockResolvedValue({
      publicCoordinateMode: 'hidden',
      brandName: '云岭农业',
      industryName: '果蔬',
      defaultCropName: '葡萄',
      workbenchTitle: '云岭工作台',
      defaultBaseLabel: '弥勒基地',
    });

    await saveTenantSettings({ defaultCropName: ' 葡萄 ', publicCoordinateMode: 'hidden' });

    expect(requestMock).toHaveBeenCalledWith('/tenant-settings', expect.objectContaining({ method: 'PUT' }));
    expect(JSON.parse(requestMock.mock.calls[0][1].body)).toEqual({
      defaultCropName: '葡萄',
      publicCoordinateMode: 'hidden',
    });
  });
});
