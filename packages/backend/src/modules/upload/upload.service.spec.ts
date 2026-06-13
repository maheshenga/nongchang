import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { UploadService } from './upload.service';

function makeOss() {
  return { put: vi.fn().mockResolvedValue('https://cdn.example.com/farm-records/202606/x.jpg') } as any;
}
const jpg = { originalname: 'a.jpg', mimetype: 'image/jpeg', size: 1024, buffer: Buffer.from('x') } as any;

describe('UploadService.upload', () => {
  it('合法 jpeg 调 Oss.put 并返回 { url }', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss);
    const res = await svc.upload(jpg);
    expect(oss.put).toHaveBeenCalledOnce();
    expect(res.url).toBe('https://cdn.example.com/farm-records/202606/x.jpg');
  });

  it('png/webp 也允许', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss);
    await expect(svc.upload({ ...jpg, mimetype: 'image/png', originalname: 'a.png' })).resolves.toBeTruthy();
    await expect(svc.upload({ ...jpg, mimetype: 'image/webp', originalname: 'a.webp' })).resolves.toBeTruthy();
  });

  it('不支持的类型(pdf)抛 400 且不调 OSS', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss);
    await expect(svc.upload({ ...jpg, mimetype: 'application/pdf', originalname: 'a.pdf' }))
      .rejects.toThrow(BadRequestException);
    expect(oss.put).not.toHaveBeenCalled();
  });

  it('超过 5MB 抛 400', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss);
    await expect(svc.upload({ ...jpg, size: 5 * 1024 * 1024 + 1 }))
      .rejects.toThrow(BadRequestException);
  });

  it('缺少文件抛 400', async () => {
    const svc = new UploadService(makeOss());
    await expect(svc.upload(undefined as any)).rejects.toThrow(BadRequestException);
  });

  it('生成的 key 符合 farm-records/<yyyymm>/<uuid>.<ext> 规则', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss);
    await svc.upload(jpg);
    const key = oss.put.mock.calls[0][0] as string;
    expect(key).toMatch(/^farm-records\/\d{6}\/[0-9a-f-]{36}\.jpg$/);
  });
});
