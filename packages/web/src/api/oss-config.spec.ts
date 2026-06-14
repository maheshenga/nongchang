import { describe, it, expect, vi, beforeEach } from 'vitest';
const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));
import { getOssConfig, upsertOssConfig, testOssConfig } from './oss-config';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('oss-config api client', () => {
  it('getOssConfig GET /oss-config', async () => {
    await getOssConfig();
    expect(requestMock).toHaveBeenCalledWith('/oss-config');
  });
  it('upsertOssConfig PUT 带 body', async () => {
    const dto = { region: 'cn', bucket: 'b', accessKeyId: 'AK', accessKeySecret: 'S' };
    await upsertOssConfig(dto as any);
    expect(requestMock).toHaveBeenCalledWith('/oss-config', { method: 'PUT', body: JSON.stringify(dto) });
  });
  it('testOssConfig POST /oss-config/test', async () => {
    await testOssConfig();
    expect(requestMock).toHaveBeenCalledWith('/oss-config/test', { method: 'POST' });
  });
});
