import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { UploadService } from './upload.service';
import { Role, type AuthUser } from '@nongchang/shared';

function makeOss() {
  return { put: vi.fn().mockResolvedValue('https://cdn.example.com/farm-records/202606/x.jpg') } as any;
}
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webpBytes = Buffer.from('RIFFxxxxWEBPVP8 ', 'ascii');
const jpg = { originalname: 'a.jpg', mimetype: 'image/jpeg', size: jpegBytes.length, buffer: jpegBytes } as any;
const admin: AuthUser = {
  userId: 'admin-1', tenantId: 'tenant-1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null,
};
const prisma = {} as any;
const quota = {
  reserve: vi.fn().mockResolvedValue({ assetId: 'asset-1' }),
  activate: vi.fn().mockResolvedValue(undefined),
  release: vi.fn().mockResolvedValue(undefined),
} as any;

describe('UploadService.upload', () => {
  it('合法 jpeg 调 Oss.put 并返回 { url }', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss, prisma, quota);
    const res = await svc.upload(jpg, admin);
    expect(oss.put).toHaveBeenCalledOnce();
    expect(res.url).toBe('https://cdn.example.com/farm-records/202606/x.jpg');
  });

  it('png/webp 也允许', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss, prisma, quota);
    await expect(svc.upload({ ...jpg, mimetype: 'image/png', originalname: 'a.png', size: pngBytes.length, buffer: pngBytes }, admin)).resolves.toBeTruthy();
    await expect(svc.upload({ ...jpg, mimetype: 'image/webp', originalname: 'a.webp', size: webpBytes.length, buffer: webpBytes }, admin)).resolves.toBeTruthy();
  });

  it('rejects fake PNG files whose content does not match PNG magic bytes', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss, prisma, quota);

    await expect(svc.upload({
      originalname: 'fake.png',
      mimetype: 'image/png',
      size: 12,
      buffer: Buffer.from('not a png'),
    } as any, admin)).rejects.toThrow(BadRequestException);
    expect(oss.put).not.toHaveBeenCalled();
  });

  it('accepts valid JPEG, PNG, and WebP signatures before writing to OSS', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss, prisma, quota);

    await svc.upload({ originalname: 'a.jpg', mimetype: 'image/jpeg', size: jpegBytes.length, buffer: jpegBytes } as any, admin);
    await svc.upload({ originalname: 'a.png', mimetype: 'image/png', size: pngBytes.length, buffer: pngBytes } as any, admin);
    await svc.upload({ originalname: 'a.webp', mimetype: 'image/webp', size: webpBytes.length, buffer: webpBytes } as any, admin);

    expect(oss.put).toHaveBeenCalledTimes(3);
  });

  it('不支持的类型(pdf)抛 400 且不调 OSS', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss, prisma, quota);
    await expect(svc.upload({ ...jpg, mimetype: 'application/pdf', originalname: 'a.pdf' }, admin))
      .rejects.toThrow(BadRequestException);
    expect(oss.put).not.toHaveBeenCalled();
  });

  it('credential purpose accepts real PDF files and stores them with pdf extension', async () => {
    const oss = { put: vi.fn().mockImplementation((key: string) => Promise.resolve(`https://cdn.example.com/${key}`)) } as any;
    const svc = new UploadService(oss, prisma, quota);
    const res = await svc.upload(
      { originalname: 'report.pdf', mimetype: 'application/pdf', size: 1000, buffer: Buffer.from('%PDF-1.7\n') } as any,
      admin,
      { purpose: 'credential' },
    );

    const key = oss.put.mock.calls[0][0] as string;
    expect(key).toMatch(/^tenants\/tenant-1\/credentials\/\d{6}\/[0-9a-f-]{36}\.pdf$/);
    expect(res.url).toBe(`https://cdn.example.com/${key}`);
  });

  it('credential purpose rejects PDF files without PDF magic bytes', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss, prisma, quota);

    await expect(svc.upload(
      { originalname: 'report.pdf', mimetype: 'application/pdf', size: 1000, buffer: Buffer.from('not a pdf') } as any,
      admin,
      { purpose: 'credential' },
    )).rejects.toThrow(BadRequestException);
    expect(oss.put).not.toHaveBeenCalled();
  });

  it('超过 5MB 抛 400', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss, prisma, quota);
    await expect(svc.upload({ ...jpg, size: 5 * 1024 * 1024 + 1 }, admin))
      .rejects.toThrow(BadRequestException);
  });

  it('缺少文件抛 400', async () => {
    const svc = new UploadService(makeOss(), prisma, quota);
    await expect(svc.upload(undefined as any, admin)).rejects.toThrow(BadRequestException);
  });

  it('生成的 key 符合 farm-records/<yyyymm>/<uuid>.<ext> 规则', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss, prisma, quota);
    await svc.upload(jpg, admin);
    const key = oss.put.mock.calls[0][0] as string;
    expect(key).toMatch(/^tenants\/tenant-1\/farm-records\/\d{6}\/[0-9a-f-]{36}\.jpg$/);
  });

  it('tenantId 透传给 oss.put', async () => {
    const oss = { put: vi.fn().mockResolvedValue('http://x/a.jpg') } as any;
    const svc = new UploadService(oss, prisma, quota);
    await svc.upload(jpg, admin);
    expect(oss.put).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), 'tenant-1');
  });
});
