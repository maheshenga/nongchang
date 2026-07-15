import { expect, test } from '@playwright/test';
import { loginByApi } from './fixtures';

test.use({ trace: 'off' });
test.describe.configure({ mode: 'serial' });

test('merchant dashboard quick action opens the field workbench', async ({ page }) => {
  await loginByApi(page);

  await page.getByRole('button', { name: '新建农事记录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '田间工作台' })).toBeVisible();
});

test('desktop batch row keeps two primary actions plus an overflow menu', async ({ page }) => {
  await loginByApi(page);
  await page.getByRole('button', { name: '批次管理', exact: true }).click();

  const row = page.getByRole('row').filter({ hasText: 'PA-2026-001' });
  await expect(row.getByRole('button', { name: '查看', exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: '生码', exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: /更多操作/ })).toBeVisible();
  await row.getByRole('button', { name: /更多操作/ }).click();
  await expect(page.getByRole('menu', { name: /批次 PA-2026-001 操作/ })).toBeVisible();
});

test('farm completion requires confirmation and exposes undo recovery', async ({ page }) => {
  const recordType = `P1 巡田 ${Date.now()}`;
  await loginByApi(page);
  await page.getByRole('button', { name: '农事实操', exact: true }).click();
  await page.getByRole('button', { name: '快捷农事实录', exact: true }).click();

  const createDialog = page.getByRole('dialog', { name: '快捷新建记录' });
  await createDialog.getByLabel('关联批次').selectOption({ label: 'PA-2026-001' });
  await createDialog.getByLabel('作业类型').fill(recordType);
  await createDialog.getByLabel('执行描述').fill('P1 浏览器可逆完成验证');
  await createDialog.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(page.getByText('农事记录已保存', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: `标记完成 ${recordType}` }).click();
  const completeDialog = page.getByRole('dialog', { name: '完成农事记录' });
  await expect(completeDialog).toContainText(recordType);
  await completeDialog.getByRole('button', { name: '标记完成', exact: true }).click();
  await expect(page.getByText(`${recordType}已完成并归档`, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '撤销完成', exact: true }).click();
  await expect(page.getByText('已撤销完成，记录恢复为待完成', { exact: true })).toBeVisible();
});

test('public landing lookup reaches the trace result and can query another code', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('溯源码', { exact: true }).fill('ORC-DEMO0001');
  await page.getByRole('button', { name: '查询溯源', exact: true }).click();

  await expect(page.getByRole('heading', { name: '极品春白芍大雪素' })).toBeVisible();
  await expect(page.getByText('ORC-DEMO0001', { exact: true }).first()).toBeVisible();
  await page.getByLabel('重新输入溯源码').fill('ORC-NOTFOUND');
  await page.getByRole('button', { name: '查询其他溯源码', exact: true }).click();
  await expect(page.getByRole('heading', { name: '未找到该溯源码' })).toBeVisible();
});

test('merchant trace generation shows quota math and blocks an insufficient request', async ({ page }) => {
  await page.route('**/api/billing/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ownerType: 'MERCHANT', ownerId: 'merchant-e2e', aiBalance: 100, codeBalance: 50 }),
    });
  });
  await loginByApi(page);
  await page.getByRole('button', { name: '批次管理', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'PA-2026-001' });
  await row.getByRole('button', { name: '生码', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: '溯源码标签配置' });
  await expect(dialog.getByText('当前额度 50', { exact: true })).toBeVisible();
  await dialog.getByRole('spinbutton', { name: '预设批量总数' }).fill('100');
  await expect(dialog.getByText('本次申请 100', { exact: true })).toBeVisible();
  await expect(dialog.getByText('预计剩余 -50（额度不足）', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '生成真实溯源码', exact: true })).toBeDisabled();
});

test('AI task switching retains a real mocked result without exposing secrets', async ({ page }) => {
  await page.route('**/api/ai/chat', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: 'P1 会话保留结果' }) });
  });
  await loginByApi(page);
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();

  await page.getByPlaceholder('例如：叶片出现褐色斑点，如何防治？').fill('测试会话保留');
  await page.getByRole('button', { name: '提问', exact: true }).click();
  await expect(page.getByText('P1 会话保留结果', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '视觉诊断' }).click();
  await expect(page.getByRole('tabpanel', { name: '视觉诊断' })).toBeVisible();
  await page.getByRole('tab', { name: '知识问答' }).click();
  await expect(page.getByText('P1 会话保留结果', { exact: true })).toBeVisible();
  await expect(page.getByText(/apiKeyMasked|sk-\*\*\*/)).toHaveCount(0);
});

test('system admin integration edits prompt before leaving', async ({ page }) => {
  await loginByApi(page, 'sysadmin');
  await page.getByRole('button', { name: '第三方集成', exact: true }).click();
  await page.getByRole('region', { name: '微信小程序登录' }).getByLabel('AppID', { exact: true }).fill('wx-p1-unsaved');
  await page.getByRole('button', { name: '生产总览', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: '放弃未保存更改' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(page.getByText('第三方集成配置', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '生产总览', exact: true }).click();
  await page.getByRole('dialog', { name: '放弃未保存更改' }).getByRole('button', { name: '放弃更改', exact: true }).click();
  await expect(page.getByRole('heading', { name: '租户运营工作台' })).toBeVisible();
});

test('merchant production workspace has no document-level horizontal overflow', async ({ page }) => {
  await loginByApi(page);
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByText('商户生产工作台', { exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `viewport ${width}px`).toBeLessThanOrEqual(1);
  }
});
