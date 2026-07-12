import { ForbiddenException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import { describe, expect, it, vi } from 'vitest';
import { UploadService } from './upload.service';

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const jpeg = {
  originalname: 'leaf.jpg',
  mimetype: 'image/jpeg',
  size: jpegBytes.length,
  buffer: jpegBytes,
};

function actor(role: Role): AuthUser {
  return { userId: 'user-1', tenantId: 'tenant-1', role, agentId: null, ownerId: null };
}

function makeService(permissions: string[] = []) {
  const oss = { put: vi.fn().mockResolvedValue('https://cdn.example.com/leaf.jpg') } as any;
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue({ group: { permissions } }),
    },
  } as any;
  return { service: new UploadService(oss, prisma), oss, prisma };
}

describe('upload purpose authorization', () => {
  it('allows any authenticated tenant user to upload an AI diagnosis image', async () => {
    const { service, oss } = makeService();

    await expect(service.upload(jpeg, actor(Role.MERCHANT), { purpose: 'ai-diagnose' }))
      .resolves.toEqual({ url: 'https://cdn.example.com/leaf.jpg' });
    expect(oss.put).toHaveBeenCalledOnce();
  });

  it('allows credential uploads only for administrative roles', async () => {
    const { service, oss } = makeService();

    await expect(service.upload(jpeg, actor(Role.MERCHANT), { purpose: 'credential' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(oss.put).not.toHaveBeenCalled();
  });

  it('requires record:create for a merchant farm-record upload', async () => {
    const denied = makeService(['record:view']);
    await expect(denied.service.upload(jpeg, actor(Role.MERCHANT), { purpose: 'farm-record' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(denied.oss.put).not.toHaveBeenCalled();

    const allowed = makeService(['record:create']);
    await expect(allowed.service.upload(jpeg, actor(Role.MERCHANT), { purpose: 'farm-record' }))
      .resolves.toEqual({ url: 'https://cdn.example.com/leaf.jpg' });
    expect(allowed.prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', tenantId: 'tenant-1' },
      select: { group: { select: { permissions: true } } },
    });
  });

  it.each([Role.PLATFORM_ADMIN, Role.SYSTEM_ADMIN, Role.AGENT_ADMIN])(
    'lets bypass role %s use credential and farm-record purposes',
    async (role) => {
      const { service } = makeService();
      await expect(service.upload(jpeg, actor(role), { purpose: 'credential' })).resolves.toBeTruthy();
      await expect(service.upload(jpeg, actor(role), { purpose: 'farm-record' })).resolves.toBeTruthy();
    },
  );
});
