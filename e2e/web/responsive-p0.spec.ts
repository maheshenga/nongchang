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
  await page.getByRole('button', { name: 'Open navigation' }).click();
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
