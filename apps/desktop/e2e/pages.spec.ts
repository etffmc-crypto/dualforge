import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { resolve } from 'node:path';


/** Sets a React-controlled range input the way a user drag would (native setter + input event). */
async function setRange(page: Page, name: string, value: number) {
  await page.getByRole('slider', { name, exact: true }).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('Sticks page edits reach the engine profile live', async () => {
  const app = await launchApp();
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

test('Triggers page: Left hair trigger Fixed turns a partial L2 pull into a full LT', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  // Default hardware profile is digital triggers; this test exercises the analog path (no UI toggle until Plan 3B).
  await page.evaluate(async () => { const p = await window.dualforge.getProfile(); p.triggers.left.digital = false; await window.dualforge.setProfile(p); });
  await page.getByRole('tab', { name: 'Triggers' }).click();
  await page.getByRole('radiogroup', { name: 'Hair trigger mode' }).getByRole('radio', { name: 'Fixed' }).click();
  await page.getByRole('radiogroup', { name: 'Adaptive trigger effect' }).getByRole('radio', { name: 'Resistance' }).click();
  await setRange(page, 'Force', 8);
  await page.waitForTimeout(200);
  const p = await page.evaluate(() => window.dualforge.getProfile());
  expect(p.triggers.left.hairTrigger).toEqual({ mode: 'fixed' });
  expect(p.triggers.left.effect).toEqual({ mode: 'resistance', start: 2, force: 8 });
  expect(p.triggers.right.hairTrigger).toEqual({ mode: 'off' });

  await page.getByRole('tab', { name: 'Input Test' }).click();
  await page.evaluate((f) => window.dualforge.replay(f), resolve(import.meta.dirname, '../../../packages/engine/test/fixtures/stick-sweep.hidlog'));
  const bars = () => page.locator('.trigger-bar').evaluateAll((els) =>
    Object.fromEntries(els.map((e) => [e.firstElementChild!.textContent, Number(e.lastElementChild!.textContent)])));
  await expect.poll(async () => (await bars())['LT out'], { timeout: 500 }).toBe(1);
  // discriminating: the fixture ramps L2 0 → 1 in a loop, so catch a mid-ramp frame and require a full LT on it
  await expect.poll(async () => { const b = await bars(); return b['L2 raw']! > 0.1 && b['L2 raw']! < 0.9 ? b['LT out'] : -1; }, { timeout: 5000 }).toBe(1);
  await app.close();
});
