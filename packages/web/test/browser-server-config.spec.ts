import { describe, expect, it } from 'vitest';
import { resolveBrowserServerConfig } from './browser-server-config';

describe('browser server isolation', () => {
  it('uses isolated defaults and does not reuse unknown servers', () => {
    expect(resolveBrowserServerConfig({})).toEqual({
      backendPort: 3101,
      webPort: 4175,
      backendUrl: 'http://127.0.0.1:3101',
      webUrl: 'http://127.0.0.1:4175',
      reuseExistingServer: false,
    });
  });

  it('accepts explicit distinct ports and reuse opt-in', () => {
    expect(resolveBrowserServerConfig({
      E2E_BACKEND_PORT: '3201',
      E2E_WEB_PORT: '4275',
      E2E_REUSE_SERVERS: 'true',
    })).toMatchObject({ backendPort: 3201, webPort: 4275, reuseExistingServer: true });
  });

  it.each([
    { E2E_BACKEND_PORT: 'abc' },
    { E2E_WEB_PORT: '70000' },
    { E2E_BACKEND_PORT: '4200', E2E_WEB_PORT: '4200' },
  ])('rejects unsafe port configuration %#', (env) => {
    expect(() => resolveBrowserServerConfig(env)).toThrow();
  });
});
