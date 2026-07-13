import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginByApi } from './fixtures';

test.use({ trace: 'off' });

async function expectNoSeriousViolations(page: Page, selector?: string) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  const result = await (selector ? builder.include(selector) : builder).analyze();
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

  test('P1 Web merchant dashboard has no serious accessibility violations', async ({ page }) => {
    await loginByApi(page);
    await expect(page.getByText('商户生产工作台', { exact: true })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('P1 Web public trace lookup and result have no serious accessibility violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('form', { name: '公开溯源查询' })).toBeVisible();
    await expectNoSeriousViolations(page);
    await page.getByLabel('溯源码', { exact: true }).fill('ORC-DEMO0001');
    await page.getByRole('button', { name: '查询溯源', exact: true }).click();
    await expect(page.getByRole('heading', { name: '极品春白芍大雪素' })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('P1 Web AI task tabs have no serious accessibility violations', async ({ page }) => {
    await loginByApi(page);
    await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
    await expect(page.getByRole('tablist', { name: 'AI 任务' })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('P1 Web integration unsaved dialog has no serious accessibility violations', async ({ page }) => {
    await loginByApi(page, 'sysadmin');
    await page.getByRole('button', { name: '第三方集成', exact: true }).click();
    await page.getByRole('region', { name: '微信小程序登录' }).getByLabel('AppID', { exact: true }).fill('wx-a11y-unsaved');
    await page.getByRole('button', { name: '生产总览', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '放弃未保存更改' })).toBeVisible();
    await expectNoSeriousViolations(page, '[role="dialog"]');
  });
});
