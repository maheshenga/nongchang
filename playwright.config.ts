import { defineConfig, devices } from '@playwright/test';

const databaseUrl = process.env.DATABASE_URL
  ?? 'postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public';
const backendPort = Number(process.env.E2E_BACKEND_PORT ?? '3001');
if (!Number.isSafeInteger(backendPort) || backendPort < 1 || backendPort > 65_535) {
  throw new Error('E2E_BACKEND_PORT must be a valid TCP port');
}
const backendBaseUrl = `http://127.0.0.1:${backendPort}`;

const backendEnv = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  JWT_SECRET: process.env.JWT_SECRET ?? 'browser-test-access-secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'browser-test-refresh-secret',
  APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY ?? '1'.repeat(64),
  TRUST_PROXY_HOPS: '0',
  PORT: String(backendPort),
};

export default defineConfig({
  testDir: './e2e/web',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
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
      url: `${backendBaseUrl}/api/health/ready`,
      env: backendEnv,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'corepack pnpm@10.33.2 --filter web dev --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      env: { ...process.env, VITE_BACKEND_PROXY_TARGET: backendBaseUrl },
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
