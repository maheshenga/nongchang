import { expect, test } from '@playwright/test';
import { loginByApi, runtimeCredentials } from './fixtures';

test.use({ trace: 'off' });
test.describe.configure({ mode: 'serial' });

test('merchant completes the field, batch, farm-record, trace-code, and public-scan loop', async ({ page }) => {
  const suffix = `${Date.now()}`;
  const fieldName = `E2E 地块 ${suffix}`;
  const batchNo = `E2E-${suffix}`;
  const cropName = `E2E 作物 ${suffix}`;
  const recordType = `E2E 巡田 ${suffix}`;

  await loginByApi(page);

  await expect(page.getByRole('button', { name: '代理商管理', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'AI 服务商', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '计费中心', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '地块管理', exact: true }).click();
  await page.getByRole('button', { name: '绘制新地块' }).click();
  const fieldDialog = page.getByRole('dialog', { name: '新建地块' });
  await expect(fieldDialog).toBeVisible();
  await fieldDialog.getByLabel('地块名称').fill(fieldName);
  await fieldDialog.getByLabel('面积(亩)').fill('12.5');
  await fieldDialog.getByLabel('经度').fill('102.712345');
  await fieldDialog.getByLabel('纬度').fill('25.045678');
  await fieldDialog.getByRole('button', { name: '创建', exact: true }).click();
  await expect(fieldDialog).toBeHidden();
  await expect(page.getByRole('button').filter({ hasText: fieldName })).toBeVisible();

  await page.getByRole('button', { name: '批次管理', exact: true }).click();
  await page.getByRole('button', { name: '新建批次', exact: true }).click();
  const batchDialog = page.getByRole('dialog', { name: '新建批次' });
  await expect(batchDialog).toBeVisible();
  await batchDialog.getByLabel('所属地块').selectOption({ label: fieldName });
  await batchDialog.getByLabel('批次号').fill(batchNo);
  await batchDialog.getByLabel('品种').fill(cropName);
  await batchDialog.getByLabel('种植日期').fill('2026-07-01');
  await batchDialog.getByLabel('预计收获').fill('2026-10-01');
  await batchDialog.getByRole('button', { name: '创建', exact: true }).click();
  await expect(batchDialog).toBeHidden();
  await expect(page.getByRole('table').getByRole('cell', { name: batchNo, exact: true })).toBeVisible();

  await page.getByRole('button', { name: '农事实操', exact: true }).click();
  await page.getByRole('button', { name: '快捷农事实录', exact: true }).click();
  const recordDialog = page.getByRole('dialog', { name: '快捷新建记录' });
  await expect(recordDialog).toBeVisible();
  await recordDialog.getByLabel('关联批次').selectOption({ label: batchNo });
  await recordDialog.getByLabel('作业类型').fill(recordType);
  await recordDialog.getByLabel('执行描述').fill('浏览器关键流程自动化验证');
  await recordDialog.getByLabel('物料消耗').fill('测试用水 1L');
  await recordDialog.getByLabel('预估工时').fill('1.5');
  await recordDialog.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(page.getByText('农事记录已保存', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '批次管理', exact: true }).click();
  await page.getByPlaceholder('按批次号搜索').fill(batchNo);
  const batchRow = page.getByRole('row').filter({ hasText: batchNo });
  await expect(batchRow).toHaveCount(1);
  await batchRow.getByRole('button', { name: '生码', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '溯源码标签配置' })).toBeVisible();
  await page.getByRole('spinbutton', { name: '预设批量总数' }).fill('1');
  await page.getByRole('button', { name: '生成真实溯源码', exact: true }).click();

  const generationResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST'
      && response.url().includes('/api/trace/codes/')
      && response.url().includes('count=1'),
  );
  await page.getByRole('button', { name: '确认生成', exact: true }).click();
  const generationResponse = await generationResponsePromise;
  expect(generationResponse.ok()).toBeTruthy();
  const generated = await generationResponse.json() as Array<{ code: string }>;
  expect(generated).toHaveLength(1);
  const traceCode = generated[0]?.code;
  expect(traceCode).toBeTruthy();
  await expect(page.getByRole('dialog', { name: '标签打印预览' })).toBeVisible();

  await page.goto(`/#/trace/${encodeURIComponent(traceCode!)}`);
  await expect(page.getByRole('heading', { name: cropName })).toBeVisible();
  await expect(page.getByText(traceCode!, { exact: true })).toBeVisible();
  await expect(page.getByText(batchNo, { exact: true })).toBeVisible();
});

test('agent starts a billing purchase without leaving the local test surface', async ({ page }) => {
  const credentials = runtimeCredentials();
  await loginByApi(page, credentials.billingUsername);
  await page.getByRole('button', { name: '计费中心', exact: true }).click();
  await expect(page.getByText('购买额度', { exact: true })).toBeVisible();
  await expect(page.getByText('Invalid billing.plans response', { exact: true })).toHaveCount(0);

  await page.route('**/api/billing/payments', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'E2E payment handoff stopped' }),
    });
  });

  const planCard = page.getByText('AI 算力 100 次', { exact: true }).locator('xpath=ancestor::div[button][1]');
  const orderResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/billing/orders'),
  );
  await planCard.getByRole('button', { name: '购买', exact: true }).click();
  const orderResponse = await orderResponsePromise;
  expect(orderResponse.ok()).toBeTruthy();
  await expect(page.getByText('E2E payment handoff stopped', { exact: true })).toBeVisible();
});
