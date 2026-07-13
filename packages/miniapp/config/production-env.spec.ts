import { describe, expect, it } from 'vitest';
import { resolveProductionMiniappEnv } from './production-env';

describe('resolveProductionMiniappEnv', () => {
  it.each([
    [{}, 'TARO_APP_API'],
    [{ TARO_APP_API: 'http://api.example.com/api', TARO_APP_WX_APPID: 'wx0000000000000000' }, 'HTTPS'],
    [{ TARO_APP_API: 'https://REPLACE_ME.example.com/api', TARO_APP_WX_APPID: 'wx0000000000000000' }, 'placeholder'],
    [{ TARO_APP_API: 'https://api.example.com/v1', TARO_APP_WX_APPID: 'wx0000000000000000' }, '/api'],
    [{ TARO_APP_API: 'https://api.example.com/api', TARO_APP_WX_APPID: '' }, 'TARO_APP_WX_APPID'],
  ])('rejects invalid production environment %#', (env, message) => {
    expect(() => resolveProductionMiniappEnv(env)).toThrow(message);
  });

  it('returns normalized production values', () => {
    expect(resolveProductionMiniappEnv({
      TARO_APP_API: 'https://api.example.com/api/',
      TARO_APP_WX_APPID: 'wx0000000000000000',
      TARO_APP_SUPPORT_CONTACT: ' support@example.com ',
    })).toEqual({
      apiUrl: 'https://api.example.com/api',
      wxAppId: 'wx0000000000000000',
      supportContact: 'support@example.com',
    });
  });
});
