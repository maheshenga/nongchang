import { expect, test } from '@playwright/test';
import { runtimeCredentials } from './fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('logs in through the UI and logs out without persisting credentials in artifacts', async ({ page }) => {
  const credentials = runtimeCredentials();
  await page.goto('/');
  await page.getByRole('button', { name: '登录' }).first().click();

  await page.locator('#login-tenant').fill(credentials.tenantCode);
  await page.locator('#login-username').fill(credentials.username);
  await page.locator('#login-password').fill(credentials.password);
  await page.getByRole('button', { name: '安全登录' }).click();

  await expect(page.getByRole('button', { name: '退出' })).toBeVisible();
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page.getByRole('heading', { name: '农业溯源 SaaS 平台' }).first()).toBeVisible();
});
