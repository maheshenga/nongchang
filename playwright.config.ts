import { defineConfig, devices } from '@playwright/test';
import {
  assertBrowserRunnerMode,
  resolveBrowserServerConfig,
} from './packages/web/test/browser-server-config';

const servers = resolveBrowserServerConfig(process.env);
assertBrowserRunnerMode(servers);

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
});
