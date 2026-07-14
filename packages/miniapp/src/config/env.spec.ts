import { afterEach, describe, it, expect, vi } from 'vitest';

async function loadDefaultEnv() {
  vi.resetModules();
  vi.stubEnv('TARO_APP_API', '');
  vi.stubEnv('TARO_APP_WX_APPID', '');
  vi.stubEnv('TARO_APP_SUPPORT_CONTACT', '');
  return import('./env');
}

afterEach(() => vi.unstubAllEnvs());

describe('config/env', () => {
  it('exposes a non-empty /api base url', async () => {
    const { API_BASE_URL } = await loadDefaultEnv();
    expect(API_BASE_URL).toMatch(/\/api$/);
  });

  it('defaults support contact to an empty truthful configuration', async () => {
    const { SUPPORT_CONTACT } = await loadDefaultEnv();
    expect(SUPPORT_CONTACT).toBe('');
  });
});
