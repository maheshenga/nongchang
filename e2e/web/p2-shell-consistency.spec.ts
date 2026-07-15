import { expect, test, type Page } from '@playwright/test';
import { loginByApi, runtimeCredentials } from './fixtures';

test.use({ trace: 'off' });

async function expectNoDocumentOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, label).toBeLessThanOrEqual(1);
}

test('collapsed navigation category persists after reload', async ({ page }) => {
  await loginByApi(page, 'sysadmin');

  const category = page.getByRole('button', { name: '智能与计费', exact: true });
  await expect(category).toHaveAttribute('aria-expanded', 'true');
  await category.click();
  await expect(category).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'AI 助手', exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('button', { name: '退出' })).toBeVisible();
  await expect(page.getByRole('button', { name: '智能与计费', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'AI 助手', exact: true })).toHaveCount(0);
});

test('billing is reachable through one normal navigation item without a duplicate shortcut', async ({ page }) => {
  await loginByApi(page, runtimeCredentials().billingUsername);

  const billingNavigation = page.getByRole('button', { name: '计费中心', exact: true });
  await expect(billingNavigation).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Open billing resources|打开计费资源/ })).toHaveCount(0);
  await billingNavigation.click();

  await expect(page.getByRole('heading', { name: '额度管理', exact: true })).toBeVisible();
});

test('profile loading uses a neutral label and never flashes the raw user id', async ({ page }) => {
  const credentials = runtimeCredentials();
  let releaseProfile!: () => void;
  const profileGate = new Promise<void>(resolve => { releaseProfile = resolve; });
  await page.route('**/api/auth/me', async (route) => {
    await profileGate;
    await route.continue();
  });

  const response = await page.request.post('/api/auth/web/login', {
    data: {
      tenantCode: credentials.tenantCode,
      username: credentials.username,
      password: credentials.password,
    },
  });
  expect(response.ok()).toBeTruthy();
  const { accessToken } = await response.json() as { accessToken: string };
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8')) as { userId: string };

  await page.goto('/');
  await expect(page.getByRole('button', { name: '退出' })).toBeVisible();
  await expect(page.getByText('账户加载中', { exact: true })).toBeVisible();
  await expect(page.getByText(payload.userId, { exact: true })).toHaveCount(0);

  releaseProfile();
});

test('mobile navigation exposes localized accessible labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginByApi(page);

  await page.getByRole('button', { name: '打开导航' }).click();
  const dialog = page.getByRole('dialog', { name: '移动导航' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '关闭导航' })).toBeVisible();
  await expect(page.getByRole('button', { name: '关闭导航遮罩' })).toBeVisible();
});

test('workspace route survives reload and browser history navigation', async ({ page }) => {
  await loginByApi(page);

  await page.getByRole('button', { name: '农事实操', exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/records$/);
  await page.reload();
  await expect(page).toHaveURL(/#\/app\/records$/);
  await expect(page.getByRole('heading', { name: '田间工作台', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '生产总览', exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/overview$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/app\/records$/);
  await expect(page.getByRole('heading', { name: '田间工作台', exact: true })).toBeVisible();
});

test('menu trigger is mobile-only and desktop navigation stays persistent', async ({ page }) => {
  await loginByApi(page);

  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('button', { name: '打开导航' })).toBeHidden();
    await expect(page.getByRole('navigation').first()).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '打开导航' })).toBeVisible();
});

test('expanded and collapsed navigation do not create horizontal overflow at 390 or 768 pixels', async ({ page }) => {
  await loginByApi(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '打开导航' }).click();
  const mobileDialog = page.getByRole('dialog', { name: '移动导航' });
  const mobileCategory = mobileDialog.getByRole('button', { name: '生产与档案', exact: true });
  await expect(mobileCategory).toHaveAttribute('aria-expanded', 'true');
  await expectNoDocumentOverflow(page, '390px expanded mobile navigation');
  await mobileCategory.click();
  await expect(mobileCategory).toHaveAttribute('aria-expanded', 'false');
  await expectNoDocumentOverflow(page, '390px collapsed mobile navigation');
  await mobileCategory.click();
  await expectNoDocumentOverflow(page, '390px re-expanded mobile navigation');
  await mobileDialog.getByRole('button', { name: '关闭导航' }).click();

  await page.setViewportSize({ width: 768, height: 844 });
  const desktopCategory = page.getByRole('button', { name: '生产与档案', exact: true });
  await expect(desktopCategory).toBeVisible();
  await expectNoDocumentOverflow(page, '768px expanded desktop navigation');
  await desktopCategory.click();
  await expect(desktopCategory).toHaveAttribute('aria-expanded', 'false');
  await expectNoDocumentOverflow(page, '768px collapsed desktop navigation');
  await desktopCategory.click();
  await expectNoDocumentOverflow(page, '768px re-expanded desktop navigation');
});
