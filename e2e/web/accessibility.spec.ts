import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginByApi } from './fixtures';

test.use({ trace: 'off' });

async function expectNoSeriousViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const violations = result.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''));
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test.describe('@a11y accessibility', () => {
  test('public landing has no serious accessibility violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '农业溯源 SaaS 平台' }).first()).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('login form has no serious accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '登录' }).first().click();
    await expect(page.locator('#login-password')).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('primary authenticated admin surface has no serious accessibility violations', async ({ page }) => {
    await loginByApi(page);
    await expectNoSeriousViolations(page);
  });

  test('field creation dialog has no serious accessibility violations', async ({ page }) => {
    await loginByApi(page);
    await page.getByRole('button', { name: '地块管理', exact: true }).click();
    await page.getByRole('button', { name: '绘制新地块' }).click();
    await expect(page.getByRole('dialog', { name: '新建地块' })).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});
