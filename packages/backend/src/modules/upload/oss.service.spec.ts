import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const putMock = vi.fn();
const ctorMock = vi.fn();
vi.mock('ali-oss', () => ({
  default: class {
    put = putMock;
    constructor(opts: unknown) {
      ctorMock(opts);
    }
  },
}));

import { OssService } from './oss.service';
import type { OssConfigService } from '../oss-config/oss-config.service';

// 不传 tenantId 时 getCredentials 不会被调用,返回 null 即可
const stubNoConfig = { getCredentials: async () => null } as unknown as OssConfigService;

describe('OssService.put — env 回退路径', () => {
  beforeEach(() => {
    putMock.mockReset();
    ctorMock.mockReset();
    putMock.mockResolvedValue({ url: 'https://oss-default.example.com/farm-records/202606/x.jpg' });
    delete process.env.OSS_BASE_URL;
  });
  afterEach(() => {
    delete process.env.OSS_BASE_URL;
  });

  it('未配置 OSS_BASE_URL 时返回 OSS 原始 url', async () => {
    const svc = new OssService(stubNoConfig);
    const url = await svc.put('farm-records/202606/x.jpg', Buffer.from('x'));
    expect(url).toBe('https://oss-default.example.com/farm-records/202606/x.jpg');
    expect(putMock).toHaveBeenCalledWith('farm-records/202606/x.jpg', expect.any(Buffer));
  });

  it('配置 OSS_BASE_URL 时用该域名拼 key', async () => {
    process.env.OSS_BASE_URL = 'https://cdn.example.com';
    const svc = new OssService(stubNoConfig);
    const url = await svc.put('farm-records/202606/x.jpg', Buffer.from('x'));
    expect(url).toBe('https://cdn.example.com/farm-records/202606/x.jpg');
  });

  it('OSS_BASE_URL 末尾斜杠被去除', async () => {
    process.env.OSS_BASE_URL = 'https://cdn.example.com/';
    const svc = new OssService(stubNoConfig);
    const url = await svc.put('farm-records/202606/x.jpg', Buffer.from('x'));
    expect(url).toBe('https://cdn.example.com/farm-records/202606/x.jpg');
  });
});

describe('OssService.put — 租户 DB 配置路径', () => {
  beforeEach(() => {
    putMock.mockReset();
    ctorMock.mockReset();
    putMock.mockResolvedValue({ url: 'https://oss-raw.example.com/farm-records/202606/x.jpg' });
    delete process.env.OSS_BASE_URL;
  });

  it('传 tenantId 且有启用配置时用 DB 凭据构造 client 并用其 baseUrl 拼 key', async () => {
    const getCredentials = vi.fn().mockResolvedValue({
      region: 'oss-cn-hangzhou',
      bucket: 'tenant-bucket',
      accessKeyId: 'AK-DB',
      accessKeySecret: 'SECRET-DB',
      baseUrl: 'https://tenant-cdn.example.com',
    });
    const svc = new OssService({ getCredentials } as unknown as OssConfigService);

    const url = await svc.put('farm-records/202606/x.jpg', Buffer.from('x'), 'tenant-1');

    expect(getCredentials).toHaveBeenCalledWith('tenant-1');
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'oss-cn-hangzhou', bucket: 'tenant-bucket', accessKeyId: 'AK-DB', accessKeySecret: 'SECRET-DB' }),
    );
    expect(putMock).toHaveBeenCalledWith('farm-records/202606/x.jpg', expect.any(Buffer));
    expect(url).toBe('https://tenant-cdn.example.com/farm-records/202606/x.jpg');
  });

  it('DB 配置无 baseUrl 时回退用 client.put 返回的 res.url', async () => {
    const getCredentials = vi.fn().mockResolvedValue({
      region: 'oss-cn-hangzhou',
      bucket: 'tenant-bucket',
      accessKeyId: 'AK-DB',
      accessKeySecret: 'SECRET-DB',
      baseUrl: null,
    });
    const svc = new OssService({ getCredentials } as unknown as OssConfigService);

    const url = await svc.put('farm-records/202606/x.jpg', Buffer.from('x'), 'tenant-1');

    expect(url).toBe('https://oss-raw.example.com/farm-records/202606/x.jpg');
  });
});
