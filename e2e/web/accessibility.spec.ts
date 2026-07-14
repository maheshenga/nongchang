import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginByApi } from './fixtures';

test.use({ trace: 'off' });

async function expectNoSeriousViolations(page: Page, selector?: string) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  const result = await (selector ? builder.include(selector) : builder).analyze();
  const violations = result.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''));
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test.describe('@a11y accessibility', () => {
  test('P2 mobile Fluent controls meet the 44 pixel touch-target floor', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginByApi(page);

    const expectTouchHeight = async (locator: Locator) => {
      const box = await locator.boundingBox();
      expect(box, 'interactive control must have a rendered box').not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    };

    const menuTrigger = page.getByRole('button', { name: '打开导航' });
    await expectTouchHeight(menuTrigger);
    await expectTouchHeight(page.getByRole('button', { name: '账户', exact: true }));
    await expectTouchHeight(page.getByRole('button', { name: '退出', exact: true }));

    await menuTrigger.click();
    const drawer = page.getByRole('dialog', { name: '移动导航' });
    await expectTouchHeight(drawer.getByRole('button', { name: '关闭导航' }));
    const drawerSearch = drawer.getByRole('combobox', { name: '全局搜索' });
    const searchBox = await drawerSearch.boundingBox();
    expect(searchBox?.height).toBeGreaterThanOrEqual(44);

    await page.keyboard.press('Escape');
    await page.goto('/#/app/batches');
    await expect(page.getByRole('heading', { name: '批次全生命周期管理' })).toBeVisible();
    await expectTouchHeight(page.getByRole('button', { name: '筛选', exact: true }));
    const batchSearch = page.getByPlaceholder('按批次号搜索');
    expect((await batchSearch.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });

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

  test('P2 Web expanded and collapsed navigation have no serious accessibility violations', async ({ page }) => {
    await loginByApi(page, 'sysadmin');
    const category = page.getByRole('button', { name: '配置与合规', exact: true });

    await expect(category).toHaveAttribute('aria-expanded', 'true');
    await expectNoSeriousViolations(page);
    await category.click();
    await expect(category).toHaveAttribute('aria-expanded', 'false');
    await expectNoSeriousViolations(page);
  });

  test('P2 Web localized mobile navigation dialog has no serious accessibility violations', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginByApi(page);
    await page.getByRole('button', { name: '打开导航' }).click();
    await expect(page.getByRole('dialog', { name: '移动导航' })).toBeVisible();

    await expectNoSeriousViolations(page, '[role="dialog"]');
  });

  test('P2 Web mobile drawer contains focus and restores the trigger', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginByApi(page);
    const trigger = page.getByRole('button', { name: '打开导航' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '移动导航' });
    const close = dialog.getByRole('button', { name: '关闭导航' });
    await expect(close).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('P2 Web global search supports listbox keyboard navigation', async ({ page }) => {
    await loginByApi(page);
    const search = page.getByRole('combobox', { name: '全局搜索' });
    await search.fill('批次');
    const listbox = page.getByRole('listbox', { name: '菜单结果' });
    await expect(listbox).toBeVisible();
    await expectNoSeriousViolations(page);

    await search.press('ArrowDown');
    await search.press('Enter');

    await expect(page).toHaveURL(/#\/app\/batches$/);
  });
});
