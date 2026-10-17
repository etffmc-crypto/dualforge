import { expect, test, type Page } from '@playwright/test';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { signKey } from '../../../scripts/license-tool.mjs';

/** Screenshots for the licensing review (DF-030), looked at by hand: apps/desktop/test-results/licensing/. */
const SHOTS = resolve(import.meta.dirname, '../test-results/licensing');
const MONTHLY = {
  status: 'active',
  variant: 'monthly',
  expiresAt: '2026-11-16T00:00:00Z',
  limit: 2,
};

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(150); // let the card settle after a state change
  await page.screenshot({ path: join(SHOTS, name) });
}

async function openPlan(page: Page) {
  await page.getByRole('button', { name: 'Open Settings' }).click();
  const plan = page.locator('#plan');
  await expect(plan).toBeVisible();
  await plan.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  return plan;
}

test('Pro licensing with the fake provider: Free, gates, activate, lapse, reactivate, founder key, remove', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'df-e2e-lic-'));
  const server = (keys: Record<string, object>, down = false) =>
    writeFileSync(join(dataDir, 'fake-license-server.json'), JSON.stringify({ keys, down }));
  server({ 'FAKE-MONTHLY': MONTHLY });
  // the test's own founder keypair; the app only trusts it because this is a fake-provider test run
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const founderKey = signKey(
    {
      v: 1,
      id: 'e2e-founder',
      kind: 'founder',
      name: 'Test Founder',
      issuedAt: '2026-10-16T00:00:00Z',
      expiresAt: null,
      note: 'e2e',
    },
    privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  );

  const app = await launchApp({
    DUALFORGE_DATA_DIR: dataDir,
    DUALFORGE_LICENSE_PROVIDER: 'fake',
    DUALFORGE_LS_CHECKOUT_URL: 'https://example.invalid/checkout',
    DUALFORGE_FOUNDER_PUBLIC_KEY: publicKey
      .export({ format: 'der', type: 'spki' })
      .toString('base64'),
  });
  try {
    const page = await app.firstWindow();
    // tall enough that the whole Plan card fits in one screenshot
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setSize(1280, 1000),
    );
    // a Pro setting saved in slot 1 (allowed on Free: it is stored, just paused)
    await page.evaluate(async () => {
      const p = await window.dualforge.profiles.get('p1');
      p.mappings.cross = {
        targets: [{ type: 'key', code: 'VK_SPACE' }],
        turbo: { mode: 'off', hz: 12 },
        continuous: false,
      };
      await window.dualforge.profiles.set(p);
    });
    await page.reload();

    // 1. Plan card on Free
    const plan = await openPlan(page);
    await expect(plan.getByLabel('Plan: Free')).toBeVisible();
    await expect(plan.getByText("You're on DualForge Free.", { exact: false })).toBeVisible();
    await expect(plan.getByText('Pro: $4.99 a month, $29.99 a year')).toBeVisible();
    await expect(plan.getByText("This profile has Pro settings. They're kept")).toBeVisible();
    await expect(plan.getByRole('button', { name: 'Get Pro' })).toBeVisible();
    await shot(page, '01-plan-free.png');

    // 2. a locked control (slots 3 and 4, share export, auto-switch), and main refuses on its own
    await page.getByRole('button', { name: 'Open Profiles' }).click();
    const slot3 = page.getByRole('article', { name: 'Slot 3' });
    await expect(slot3.getByText('Pro', { exact: true })).toBeVisible();
    await expect(slot3.getByRole('button', { name: 'Activate' })).toBeDisabled();
    await expect(page.getByText('Share-code export is part of DualForge Pro.')).toBeVisible();
    await page.locator('.profiles-page').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await shot(page, '02-locked-profiles.png');
    const refused = await page.evaluate(() =>
      window.dualforge.profiles.activate('p3').then(
        () => 'ok',
        (e: unknown) => String(e),
      ),
    );
    expect(refused).toContain('E_LICENSE_PRO');

    // 3. activate FAKE-MONTHLY: Pro at once, the locks are gone
    await openPlan(page);
    await plan.getByLabel('License key').fill('FAKE-MONTHLY');
    await plan.getByRole('button', { name: 'Activate' }).click();
    await expect(plan.getByLabel('Plan: Pro')).toBeVisible();
    await expect(plan.getByText('Pro is active on this PC.')).toBeVisible();
    await expect(plan.getByText('Pro (monthly). Manage or cancel it')).toBeVisible();
    await shot(page, '03-pro-active.png');
    await page.getByRole('button', { name: 'Open Profiles' }).click();
    await expect(
      page.getByRole('article', { name: 'Slot 3' }).getByRole('button', { name: 'Activate' }),
    ).toBeEnabled();
    await expect(page.getByText('is part of DualForge Pro.')).toHaveCount(0);
    // something only Pro may do, kept to check it survives the lapse
    await page.evaluate(() => window.dualforge.profiles.rename('p3', 'Slot three kept'));

    // 4. lapse in the fake server, Check now: back to Free with the message, profiles intact
    server({ 'FAKE-MONTHLY': { ...MONTHLY, status: 'expired' } });
    await openPlan(page);
    await plan.getByRole('button', { name: 'Check now' }).click();
    await expect(plan.getByLabel('Plan: Free')).toBeVisible();
    await expect(plan.getByText('Your Pro subscription has ended')).toBeVisible();
    await shot(page, '04-lapsed.png');
    const kept = await page.evaluate(async () => ({
      p3: (await window.dualforge.profiles.get('p3')).name,
      p1: (await window.dualforge.profiles.get('p1')).mappings.cross?.targets,
    }));
    expect(kept).toEqual({ p3: 'Slot three kept', p1: [{ type: 'key', code: 'VK_SPACE' }] });

    // 5. restore it in the server and reactivate
    server({ 'FAKE-MONTHLY': MONTHLY });
    await plan.getByLabel('License key').fill('FAKE-MONTHLY');
    await plan.getByRole('button', { name: 'Activate' }).click();
    await expect(plan.getByLabel('Plan: Pro')).toBeVisible();
    await expect(plan.getByText('Your Pro subscription has ended')).toHaveCount(0);
    await shot(page, '05-reactivated.png');

    // 6. a founder key (works offline)
    server({}, true);
    await plan.getByLabel('License key').fill(founderKey);
    await plan.getByRole('button', { name: 'Activate' }).click();
    await expect(plan.getByLabel('Plan: Pro (founder key)')).toBeVisible();
    await expect(plan.getByText('Lifetime: all future updates included.')).toBeVisible();
    await shot(page, '06-founder-key.png');

    // 7. Remove license: Free again, nothing deleted
    await plan.getByRole('button', { name: 'Remove license' }).click();
    await expect(plan.getByLabel('Plan: Free')).toBeVisible();
    await expect(plan.getByRole('button', { name: 'Remove license' })).toHaveCount(0);
    await shot(page, '07-removed.png');
    expect(await page.evaluate(async () => (await window.dualforge.profiles.get('p3')).name)).toBe(
      'Slot three kept',
    );
    const settings = await page.evaluate(() => window.dualforge.settings.get());
    expect(settings).not.toHaveProperty('license');
  } finally {
    await app.close();
  }
});

test('dormant build (no provider): no Plan card, slots 3 and 4 work as in 0.3.x', async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Open Settings' }).click();
    await expect(page.getByRole('heading', { name: 'App' })).toBeVisible();
    await expect(page.locator('#plan')).toHaveCount(0);
    const view = await page.evaluate(() => window.dualforge.license.get());
    expect(view.enforced).toBe(false);
    const p = await page.evaluate(() => window.dualforge.profiles.activate('p4'));
    expect(p.id).toBe('p4');
  } finally {
    await app.close();
  }
});
