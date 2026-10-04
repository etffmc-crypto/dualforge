import { _electron as electron, expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('app launches, pages render, replay drives widgets', async () => {
  const app = await electron.launch({ args: [resolve(import.meta.dirname, '../out/main/index.js')] });
  const page = await app.firstWindow();
  await expect(page.getByText('DUALFORGE', { exact: true })).toBeVisible();
  await expect(page.getByText(/Select controller|Connected/)).toBeVisible();
  await page.getByRole('tab', { name: 'Input Test' }).click();
  await expect(page.getByText('Virtual Xbox output')).toBeVisible();
  await page.evaluate((p) => window.dualforge.replay(p), resolve(import.meta.dirname, '../../../packages/engine/test/fixtures/stick-sweep.hidlog'));
  await expect.poll(async () => page.locator('.cell.on').count(), { timeout: 5000 }).toBeGreaterThan(0);
  await app.close();
});

test('face-lift tokens applied', async () => {
  const app = await electron.launch({ args: [resolve(import.meta.dirname, '../out/main/index.js')] });
  const page = await app.firstWindow();
  const header = page.locator('header.header');
  expect(await header.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(23, 19, 24)');
  expect(await header.evaluate((e) => getComputedStyle(e).height)).toBe('100px');
  const active = page.locator('[role="tab"][aria-selected="true"]');
  await expect(active).toHaveCount(1);
  expect(await page.locator('body').evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Poppins/);
  await expect(page.locator('.footer .badge-a')).toHaveText('A');
  await app.close();
});
