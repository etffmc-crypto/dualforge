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

for (const width of [1000, 1100, 1280]) {
  test(`header: the section tabs do not overlap the header buttons at ${width} px wide`, async () => {
    const app = await launchApp();
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }, w) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      win.unmaximize();
      win.setSize(w, 700);
    }, width);
    await expect(page.getByRole('tablist', { name: 'Sections' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    const edges = await page.evaluate(() => {
      const right = (s: string) => document.querySelector(s)!.getBoundingClientRect().right;
      const tabs = Array.from(document.querySelectorAll('.tabstrip .tab'));
      const first = tabs[0]!.getBoundingClientRect().left;
      const last = tabs[tabs.length - 1]!.getBoundingClientRect().right;
      return {
        brandRight: right('.brand'),
        actionsLeft: document.querySelector('.header-actions')!.getBoundingClientRect().left,
        first,
        last,
      };
    });
    expect(edges.first).toBeGreaterThanOrEqual(edges.brandRight);
    expect(edges.last).toBeLessThanOrEqual(edges.actionsLeft);
    await app.close();
  });
}

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
  await expect(page.locator('.footer .version')).toHaveText('V0.3.7'); // injected from root package.json
  await app.close();
});
