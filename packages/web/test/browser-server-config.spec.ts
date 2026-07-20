import { describe, expect, it } from 'vitest';
import * as browserServerConfig from './browser-server-config';
import { resolveBrowserServerConfig } from './browser-server-config';

type ResolveManagedBrowserProcesses = (input: {
  webPort: number;
  nodeExecutable: string;
}) => {
  backend: { command: string; args: string[] };
  web: { command: string; args: string[] };
};

type ResolveBrowserBackendEnv = (
  env: NodeJS.ProcessEnv,
  backendPort: number,
) => NodeJS.ProcessEnv;

type AssertBrowserRunnerMode = (config: {
  reuseExistingServer: boolean;
}) => void;

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

  it('uses direct Node processes for managed browser servers', () => {
    const resolveManagedBrowserProcesses = (
      browserServerConfig as typeof browserServerConfig & {
        resolveManagedBrowserProcesses?: ResolveManagedBrowserProcesses;
      }
    ).resolveManagedBrowserProcesses;

    expect(resolveManagedBrowserProcesses).toBeTypeOf('function');
    expect(resolveManagedBrowserProcesses?.({
      webPort: 4275,
      nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
    })).toEqual({
      backend: {
        command: 'C:\\Program Files\\nodejs\\node.exe',
        args: ['packages/backend/dist/src/main.js'],
      },
      web: {
        command: 'C:\\Program Files\\nodejs\\node.exe',
        args: [
          'packages/web/node_modules/vite/bin/vite.js',
          'packages/web',
          '--config',
          'packages/web/vite.config.ts',
          '--host',
          '127.0.0.1',
          '--port',
          '4275',
          '--strictPort',
        ],
      },
    });
  });

  it('shares one deterministic backend test environment', () => {
    const resolveBrowserBackendEnv = (
      browserServerConfig as typeof browserServerConfig & {
        resolveBrowserBackendEnv?: ResolveBrowserBackendEnv;
      }
    ).resolveBrowserBackendEnv;

    expect(resolveBrowserBackendEnv).toBeTypeOf('function');
    expect(resolveBrowserBackendEnv?.({ DATABASE_URL: 'postgres://test', JWT_SECRET: 'jwt-test' }, 3201))
      .toMatchObject({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://test',
        JWT_SECRET: 'jwt-test',
        JWT_REFRESH_SECRET: 'browser-test-refresh-secret',
        APP_ENCRYPTION_KEY: '1'.repeat(64),
        TRUST_PROXY_HOPS: '0',
        PORT: '3201',
      });
  });

  it('requires direct Playwright invocations to use the verified runner mode', () => {
    const assertBrowserRunnerMode = (
      browserServerConfig as typeof browserServerConfig & {
        assertBrowserRunnerMode?: AssertBrowserRunnerMode;
      }
    ).assertBrowserRunnerMode;

    expect(assertBrowserRunnerMode).toBeTypeOf('function');
    expect(() => assertBrowserRunnerMode?.({ reuseExistingServer: false })).toThrow(
      /pnpm test:browser:run/,
    );
    expect(() => assertBrowserRunnerMode?.({ reuseExistingServer: true })).not.toThrow();
  });
});
