import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));

import { getOssConfig, testOssConfig, upsertOssConfig } from './oss-config';

const config = {
  region: 'cn', bucket: 'b', accessKeyId: 'AK', accessKeySecretMasked: '***',
  baseUrl: null, enabled: true,
};

beforeEach(() => requestMock.mockReset());

describe('oss-config api client', () => {
  it('gets OSS config', async () => {
    requestMock.mockResolvedValueOnce(config);
    await getOssConfig();
    expect(requestMock).toHaveBeenCalledWith('/oss-config');
  });

  it('upserts OSS config', async () => {
    requestMock.mockResolvedValueOnce(config);
    const input = { region: 'cn', bucket: 'b', accessKeyId: 'AK', accessKeySecret: 'S' };
    await upsertOssConfig(input);
    expect(requestMock).toHaveBeenCalledWith('/oss-config', {
      method: 'PUT', body: JSON.stringify(input),
    });
  });

  it('tests OSS config', async () => {
    requestMock.mockResolvedValueOnce({ ok: true, latencyMs: 12 });
    await testOssConfig();
    expect(requestMock).toHaveBeenCalledWith('/oss-config/test', { method: 'POST' });
  });
});
