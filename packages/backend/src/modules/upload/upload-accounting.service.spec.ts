import { Role, type AuthUser } from '@nongchang/shared';
import { describe, expect, it, vi } from 'vitest';
import { UploadService } from './upload.service';

const actor: AuthUser = {
  userId: 'user-1', tenantId: 'tenant-1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null,
};
const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const file = { originalname: 'leaf.jpg', mimetype: 'image/jpeg', size: bytes.length, buffer: bytes };

function setup() {
  const oss = {
    put: vi.fn().mockResolvedValue('https://cdn.example.com/leaf.jpg'),
    delete: vi.fn().mockResolvedValue(undefined),
  } as any;
  const quota = {
    reserve: vi.fn().mockResolvedValue({ assetId: 'asset-1' }),
    activate: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  } as any;
  return { service: new UploadService(oss, {} as any, quota), oss, quota };
}

describe('durable upload accounting flow', () => {
  it('reserves before OSS and activates after a successful write', async () => {
    const { service, oss, quota } = setup();
    await expect(service.upload(file, actor, { purpose: 'farm-record' }))
      .resolves.toEqual({ url: 'https://cdn.example.com/leaf.jpg' });

    expect(quota.reserve).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', userId: 'user-1', purpose: 'farm-record', sizeBytes: BigInt(bytes.length),
      checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      objectKey: expect.stringMatching(/^tenants\/tenant-1\/farm-records\//),
    }));
    expect(quota.reserve.mock.invocationCallOrder[0]).toBeLessThan(oss.put.mock.invocationCallOrder[0]);
    expect(quota.activate).toHaveBeenCalledWith('asset-1', 'https://cdn.example.com/leaf.jpg');
  });

  it('releases a pending reservation when OSS fails', async () => {
    const { service, oss, quota } = setup();
    oss.put.mockRejectedValue(new Error('OSS unavailable'));

    await expect(service.upload(file, actor, { purpose: 'farm-record' })).rejects.toThrow('OSS unavailable');
    expect(quota.release).toHaveBeenCalledWith('asset-1', 'FAILED');
    expect(quota.activate).not.toHaveBeenCalled();
  });

  it('deletes the object and releases quota when activation fails', async () => {
    const { service, oss, quota } = setup();
    quota.activate.mockRejectedValue(new Error('database unavailable'));

    await expect(service.upload(file, actor, { purpose: 'farm-record' })).rejects.toThrow('database unavailable');
    expect(oss.delete).toHaveBeenCalledWith(expect.stringMatching(/^tenants\/tenant-1\//), 'tenant-1');
    expect(quota.release).toHaveBeenCalledWith('asset-1', 'FAILED');
  });
});
