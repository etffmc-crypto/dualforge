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

test('Profiles IPC: rename p2, list, activate, engine profile follows', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.evaluate(() => window.dualforge.profiles.rename('p2', 'Racing'));
  const list = await page.evaluate(() => window.dualforge.profiles.list());
  expect(list.find((s) => s.id === 'p2')?.name).toBe('Racing');
  await page.evaluate(() => window.dualforge.profiles.activate('p2'));
  const p = await page.evaluate(() => window.dualforge.getProfile());
  expect(p.id).toBe('p2');
  expect(p.name).toBe('Racing');
  expect(await page.evaluate(() => window.dualforge.profiles.current())).toEqual({ id: 'p2', source: 'manual' });
  await app.close();
});

test('Share code round-trips a profile into slot 3', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  const result = await page.evaluate(async () => {
    const p = await window.dualforge.profiles.get('p1');
    p.sticks.left.deadzone.anti = 0.25;
    await window.dualforge.profiles.set(p);
    const code = await window.dualforge.profiles.shareCode('p1');
    const imported = await window.dualforge.profiles.importShareCode(code, 'p3');
    return { code, imported, stored: await window.dualforge.profiles.get('p3') };
  });
  expect(result.code.startsWith('DUALFORGE:')).toBe(true);
  expect(result.stored.id).toBe('p3');
  expect(result.stored.sticks.left.deadzone.anti).toBe(0.25);
  expect(result.imported.id).toBe('p3');
  await app.close();
});

test('Header profile tabs: rename Profile 2 inline, reload, the name persists', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  const slots = page.getByRole('tablist', { name: 'Profiles' });
  await expect(slots.getByRole('tab')).toHaveCount(4);
  await slots.getByRole('tab', { name: 'Profile 2' }).click({ button: 'right' });
  const input = page.getByRole('textbox', { name: 'Rename Profile 2' });
  await input.fill('Racing');
  await input.press('Enter');
  await expect(slots.getByRole('tab', { name: 'Racing' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tablist', { name: 'Profiles' }).getByRole('tab', { name: 'Racing' })).toBeVisible();
  expect((await page.evaluate(() => window.dualforge.profiles.list())).find((s) => s.id === 'p2')?.name).toBe('Racing');
  await app.close();
});

test('Settings page: Light theme re-themes the app and is saved', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Open Settings' }).click();
  await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.locator('header.header').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect((await page.evaluate(() => window.dualforge.settings.get())).theme).toBe('light');
  await page.getByRole('switch', { name: 'This controller has rumble motors' }).click();
  await expect.poll(async () => (await page.evaluate(() => window.dualforge.settings.get())).hasRumble).toBe(true);
  await app.close();
});
