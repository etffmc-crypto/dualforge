import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const MAIN = resolve(import.meta.dirname, '../out/main/index.js');

/** Sets a React-controlled range input the way a user drag would (native setter + input event). */
async function setRange(page: Page, name: string, value: number) {
  await page.getByRole('slider', { name, exact: true }).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('Sticks page edits reach the engine profile live', async () => {
  const app = await electron.launch({ args: [MAIN] });
  const page = await app.firstWindow();
  await page.getByRole('tab', { name: 'Sticks' }).click();
  await expect(page.getByRole('heading', { name: 'Anti-Deadzone' })).toBeVisible();
  await setRange(page, 'Anti-Deadzone', 0.3);
  await page.waitForTimeout(200);
  const p = await page.evaluate(() => window.dualforge.getProfile());
  expect(p.sticks.left.deadzone.anti).toBe(0.3);
  expect(p.sticks.right.deadzone.anti).toBe(0);
  await app.close();
});
