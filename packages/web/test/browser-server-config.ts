export interface BrowserServerConfig {
  backendPort: number;
  webPort: number;
  backendUrl: string;
  webUrl: string;
  reuseExistingServer: boolean;
}

export interface ManagedBrowserProcess {
  command: string;
  args: string[];
}

export interface ManagedBrowserProcesses {
  backend: ManagedBrowserProcess;
  web: ManagedBrowserProcess;
}

function readPort(raw: string | undefined, fallback: number, name: string): number {
  const value = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${name} must be an integer from 1024 through 65535`);
  }
  return value;
}

export function resolveBrowserServerConfig(env: NodeJS.ProcessEnv): BrowserServerConfig {
  const backendPort = readPort(env.E2E_BACKEND_PORT, 3101, 'E2E_BACKEND_PORT');
  const webPort = readPort(env.E2E_WEB_PORT, 4175, 'E2E_WEB_PORT');
  if (backendPort === webPort) throw new Error('E2E_BACKEND_PORT and E2E_WEB_PORT must differ');
  return {
    backendPort,
    webPort,
    backendUrl: `http://127.0.0.1:${backendPort}`,
    webUrl: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: env.E2E_REUSE_SERVERS === 'true',
  };
}

export function assertBrowserRunnerMode(
  config: Pick<BrowserServerConfig, 'reuseExistingServer'>,
): void {
  if (!config.reuseExistingServer) {
    throw new Error(
      'Browser tests must be launched through `pnpm test:browser:run` so server lifecycle is isolated.',
    );
  }
}

export function resolveBrowserBackendEnv(
  env: NodeJS.ProcessEnv,
  backendPort: number,
): NodeJS.ProcessEnv {
  return {
    ...env,
    NODE_ENV: 'test',
    DATABASE_URL: env.DATABASE_URL
      ?? 'postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public',
    JWT_SECRET: env.JWT_SECRET ?? 'browser-test-access-secret',
    JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET ?? 'browser-test-refresh-secret',
    APP_ENCRYPTION_KEY: env.APP_ENCRYPTION_KEY ?? '1'.repeat(64),
    TRUST_PROXY_HOPS: '0',
    PORT: String(backendPort),
  };
}

export function resolveManagedBrowserProcesses(input: {
  nodeExecutable: string;
  webPort: number;
}): ManagedBrowserProcesses {
  return {
    backend: {
      command: input.nodeExecutable,
      args: ['packages/backend/dist/src/main.js'],
    },
    web: {
      command: input.nodeExecutable,
      args: [
        'packages/web/node_modules/vite/bin/vite.js',
        'packages/web',
        '--config',
        'packages/web/vite.config.ts',
        '--host',
        '127.0.0.1',
        '--port',
        String(input.webPort),
        '--strictPort',
      ],
    },
  };
}
