import { expect, test } from '@playwright/test';
import { launchApp } from './launch';
import { resolve } from 'node:path';

test('app launches, pages render, replay drives widgets', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await expect(page.getByText('DUALFORGE', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Home' }).click(); // a connected pad lands on Overview
  await expect(page.getByText(/Select controller|Connected/)).toBeVisible();
  await page.getByRole('tab', { name: 'Input Test' }).click();
  await expect(page.getByText('Virtual Xbox output')).toBeVisible();
  await page.evaluate(
    (p) => window.dualforge.replay(p),
    resolve(import.meta.dirname, '../../../packages/engine/test/fixtures/stick-sweep.hidlog'),
  );
  await expect
    .poll(async () => page.locator('.cell.on').count(), { timeout: 5000 })
    .toBeGreaterThan(0);
  await app.close();
});

test('face-lift tokens applied', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  const header = page.locator('header.header');
  expect(await header.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(23, 19, 24)');
  expect(await header.evaluate((e) => getComputedStyle(e).height)).toBe('100px');
  const active = page
    .getByRole('tablist', { name: 'Sections' })
    .locator('[role="tab"][aria-selected="true"]');
  await expect(active).toHaveCount(1);
  expect(await page.locator('body').evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(
    /Poppins/,
  );
  await expect(page.locator('.footer .badge-a')).toHaveText('✕');
  await expect(page.locator('.footer .version')).toHaveText('V0.3.4'); // injected from root package.json
  await app.close();
});
