import { _electron as electron, expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('app launches, pages render, replay drives widgets', async () => {
  const app = await electron.launch({ args: [resolve(import.meta.dirname, '../out/main/index.js')] });
  const page = await app.firstWindow();
  await expect(page.getByText('DUAL', { exact: true })).toBeVisible();
  await expect(page.getByText(/Select controller|Connected/)).toBeVisible();
  await page.getByRole('button', { name: 'Input Test' }).click();
  await expect(page.getByText('Virtual Xbox output')).toBeVisible();
  await page.evaluate((p) => window.dualforge.replay(p), resolve(import.meta.dirname, '../../../packages/engine/test/fixtures/stick-sweep.hidlog'));
  await expect.poll(async () => page.locator('.cell.on').count(), { timeout: 5000 }).toBeGreaterThan(0);
  await app.close();
});
