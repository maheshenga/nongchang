import { defineConfig, devices } from '@playwright/test';
import { resolveBrowserServerConfig } from './packages/web/test/browser-server-config';

const servers = resolveBrowserServerConfig(process.env);

const databaseUrl = process.env.DATABASE_URL
  ?? 'postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public';

const backendEnv = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  JWT_SECRET: process.env.JWT_SECRET ?? 'browser-test-access-secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'browser-test-refresh-secret',
  APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY ?? '1'.repeat(64),
  TRUST_PROXY_HOPS: '0',
  PORT: String(servers.backendPort),
};

export default defineConfig({
  testDir: './e2e/web',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: servers.webUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'corepack pnpm@10.33.2 --filter @nongchang/backend start',
      url: `${servers.backendUrl}/api/health/ready`,
      env: backendEnv,
      timeout: 120_000,
      reuseExistingServer: servers.reuseExistingServer,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `corepack pnpm@10.33.2 --filter web dev --host 127.0.0.1 --port ${servers.webPort}`,
      url: servers.webUrl,
      env: { ...process.env, WEB_API_PROXY_TARGET: servers.backendUrl },
      timeout: 120_000,
      reuseExistingServer: servers.reuseExistingServer,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
