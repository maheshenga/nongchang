import { expect, test } from '@playwright/test';

test.use({ trace: 'off' });

test.describe('public landing and login', () => {
  test('opens the public landing page and reaches the login form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '农业溯源 SaaS 平台' }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '登录' }).first().click();
    await expect(page.locator('#login-tenant')).toBeVisible();
    await expect(page.locator('#login-username')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
  });
});
