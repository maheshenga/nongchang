import { expect, test } from '@playwright/test';
import { loginByApi } from './fixtures';

test.use({ trace: 'off' });

test('field create dialog stays above the map detail card', async ({ page }) => {
  await loginByApi(page);
  await page.getByRole('button', { name: '地块管理', exact: true }).click();
  await page.getByRole('button', { name: '绘制新地块' }).click();

  const dialog = page.getByRole('dialog', { name: '新建地块' });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('field-map-detail')).toBeVisible();

  const layers = await page.evaluate(() => {
    const modal = document.querySelector<HTMLElement>('[data-modal-layer="true"]');
    const fieldDetail = document.querySelector<HTMLElement>('[data-testid="field-map-detail"]');
    return {
      modal: Number.parseInt(getComputedStyle(modal!).zIndex || '0', 10),
      detail: Number.parseInt(getComputedStyle(fieldDetail!).zIndex || '0', 10),
      modalParent: modal?.parentElement?.tagName,
    };
  });

  expect(layers.modal).toBeGreaterThan(layers.detail);
  expect(layers.modalParent).toBe('BODY');
});

test('all batch actions are reachable at 390 pixels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginByApi(page);
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('button', { name: '批次管理', exact: true }).click();

  const list = page.getByRole('list', { name: '批次列表' });
  await expect(list).toBeVisible();
  const card = list.getByRole('listitem').first();
  await expect(card.getByRole('button', { name: /查看批次/ })).toBeVisible();
  await expect(card.getByRole('button', { name: /生码/ })).toBeVisible();

  await card.getByRole('button', { name: /更多操作/ }).click();
  const menu = page.getByRole('menu');
  for (const label of ['已生成码', '合规', '资质', '利润', '报告', '删除']) {
    await expect(menu.getByRole('menuitem', { name: label })).toBeVisible();
  }

  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(pageOverflow).toBe(false);
});

test('product archive uses mobile cards and confirms before label generation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let generationRequests = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/api/trace/codes/')) generationRequests += 1;
  });

  await loginByApi(page);
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('button', { name: '产品档案', exact: true }).click();

  const list = page.getByRole('list', { name: '产品档案列表' });
  await expect(list).toBeVisible();
  const card = list.getByRole('listitem').first();
  await expect(card.getByRole('button', { name: /配置溯源标签/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  await card.getByRole('button', { name: /配置溯源标签/ }).click();
  const workspace = page.getByRole('dialog', { name: '溯源码标签配置' });
  await expect(workspace).toBeVisible();
  await expect(workspace.getByLabel('预设批量总数')).toHaveValue('1');

  await workspace.getByRole('button', { name: '生成真实溯源码' }).click();
  const confirmation = page.getByRole('dialog', { name: '批量生成并导出溯源标签矩阵' });
  await expect(confirmation).toBeVisible();
  expect(generationRequests).toBe(0);

  await confirmation.getByRole('button', { name: '取消' }).click();
  await workspace.getByRole('button', { name: '暂缓生成' }).click();
  await expect(workspace).toBeHidden();
  expect(generationRequests).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
