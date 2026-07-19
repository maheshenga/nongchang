import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { createField, listFields } from './fields';

const now = '2026-07-13T00:00:00.000Z';
const field = {
  id: 'field-1', tenantId: 'tenant-1', ownerId: 'owner-1', name: 'Field A', area: 12,
  iotDeviceId: null, createdAt: now,
};

beforeEach(() => requestMock.mockReset());

describe('field api response contracts', () => {
  it('parses create responses and normalizes enriched fields', async () => {
    requestMock.mockResolvedValue({
      ...field,
      ownerName: '张三农场',
      lng: 100,
      lat: 25,
    });
    await expect(createField({} as never)).resolves.toEqual({
      ...field,
      ownerName: '张三农场',
      lng: 100,
      lat: 25,
    });
  });

  it('rejects malformed list responses', async () => {
    requestMock.mockResolvedValue([{ ...field, id: undefined }]);
    await expect(listFields()).rejects.toThrow();
  });
});
