import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const putMock = vi.fn();
vi.mock('ali-oss', () => ({
  default: class {
    put = putMock;
  },
}));

import { OssService } from './oss.service';

describe('OssService.put', () => {
  beforeEach(() => {
    putMock.mockReset();
    putMock.mockResolvedValue({ url: 'https://oss-default.example.com/farm-records/202606/x.jpg' });
    delete process.env.OSS_BASE_URL;
  });
  afterEach(() => {
    delete process.env.OSS_BASE_URL;
  });

  it('未配置 OSS_BASE_URL 时返回 OSS 原始 url', async () => {
    const svc = new OssService();
    const url = await svc.put('farm-records/202606/x.jpg', Buffer.from('x'));
    expect(url).toBe('https://oss-default.example.com/farm-records/202606/x.jpg');
    expect(putMock).toHaveBeenCalledWith('farm-records/202606/x.jpg', expect.any(Buffer));
  });

  it('配置 OSS_BASE_URL 时用该域名拼 key', async () => {
    process.env.OSS_BASE_URL = 'https://cdn.example.com';
    const svc = new OssService();
    const url = await svc.put('farm-records/202606/x.jpg', Buffer.from('x'));
    expect(url).toBe('https://cdn.example.com/farm-records/202606/x.jpg');
  });

  it('OSS_BASE_URL 末尾斜杠被去除', async () => {
    process.env.OSS_BASE_URL = 'https://cdn.example.com/';
    const svc = new OssService();
    const url = await svc.put('farm-records/202606/x.jpg', Buffer.from('x'));
    expect(url).toBe('https://cdn.example.com/farm-records/202606/x.jpg');
  });
});
