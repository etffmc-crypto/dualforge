import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const HIDHIDE_CLI = 'C:\\Program Files\\Nefarius Software Solutions\\HidHide\\x64\\HidHideCLI.exe';

/** Sets a React-controlled range input the way a user drag would (native setter + input event). */
async function setRange(page: Page, name: string, value: number) {
  await page.getByRole('slider', { name, exact: true }).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      String(v),
    );
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
  // Default hardware profile is digital triggers; this test exercises the analog path, so switch Left to analog first.
  await page.getByRole('tab', { name: 'Triggers' }).click();
  await page.getByRole('switch', { name: 'Digital (mouse-click) trigger' }).click();
  await page
    .getByRole('radiogroup', { name: 'Hair trigger mode' })
    .getByRole('radio', { name: 'Fixed' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Adaptive trigger effect' })
    .getByRole('radio', { name: 'Resistance' })
    .click();
  await setRange(page, 'Force', 8);
  await page.waitForTimeout(200);
  const p = await page.evaluate(() => window.dualforge.getProfile());
  expect(p.triggers.left.hairTrigger).toEqual({ mode: 'fixed' });
  expect(p.triggers.left.effect).toEqual({ mode: 'resistance', start: 2, force: 8 });
  expect(p.triggers.right.hairTrigger).toEqual({ mode: 'off' });

  await page.getByRole('tab', { name: 'Input Test' }).click();
  await page.evaluate(
    (f) => window.dualforge.replay(f),
    resolve(import.meta.dirname, '../../../packages/engine/test/fixtures/stick-sweep.hidlog'),
  );
  const bars = () =>
    page
      .locator('.trigger-bar')
      .evaluateAll((els) =>
        Object.fromEntries(
          els.map((e) => [
            e.firstElementChild!.textContent,
            Number(e.lastElementChild!.textContent),
          ]),
        ),
      );
  await expect.poll(async () => (await bars())['LT out'], { timeout: 500 }).toBe(1);
  // discriminating: the fixture ramps L2 0 → 1 in a loop, so catch a mid-ramp frame and require a full LT on it
  await expect
    .poll(
      async () => {
        const b = await bars();
        return b['L2 raw']! > 0.1 && b['L2 raw']! < 0.9 ? b['LT out'] : -1;
      },
      { timeout: 5000 },
    )
    .toBe(1);
  await app.close();
});

test('Triggers page: the Digital toggle hides the analog sections and reaches the engine profile', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('tab', { name: 'Triggers' }).click();
  const sw = page.getByRole('switch', { name: 'Digital (mouse-click) trigger' });
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Output: full pull on click')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Hair trigger mode' })).toHaveCount(0);
  await sw.click();
  await expect(page.getByRole('radiogroup', { name: 'Hair trigger mode' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Adaptive trigger effect' })).toBeVisible();
  await expect
    .poll(
      async () => (await page.evaluate(() => window.dualforge.getProfile())).triggers.left.digital,
      { timeout: 2000 },
    )
    .toBe(false);
  expect((await page.evaluate(() => window.dualforge.getProfile())).triggers.right.digital).toBe(
    true,
  );
  await sw.click();
  await expect(page.getByRole('radiogroup', { name: 'Hair trigger mode' })).toHaveCount(0);
  await expect
    .poll(
      async () => (await page.evaluate(() => window.dualforge.getProfile())).triggers.left.digital,
      { timeout: 2000 },
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Remap on the Buttons page' }).click();
  await expect(page.getByRole('tab', { name: 'Buttons' })).toHaveAttribute('aria-selected', 'true');
  await app.close();
});

test('Input Test: a REPLAY badge shows while a recording plays, and goes away back on the controller', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('tab', { name: 'Input Test' }).click();
  await expect(page.getByRole('meter', { name: 'Yaw' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Touchpad' })).toBeVisible();
  await expect(page.getByText('REPLAY', { exact: true })).toHaveCount(0);
  await page.evaluate(
    (f) => window.dualforge.replay(f),
    resolve(import.meta.dirname, '../../../packages/engine/test/fixtures/stick-sweep.hidlog'),
  );
  await expect(page.getByText('REPLAY', { exact: true })).toBeVisible({ timeout: 5000 });
  await page.getByRole('tab', { name: 'Home' }).click();
  await expect(page.getByText(/Connected · Replay/)).toBeVisible();
  await page.getByRole('tab', { name: 'Input Test' }).click();
  await page.getByRole('button', { name: 'Use the controller' }).click();
  await expect(page.getByText('REPLAY', { exact: true })).toHaveCount(0, { timeout: 5000 });
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
  expect(await page.evaluate(() => window.dualforge.profiles.current())).toEqual({
    id: 'p2',
    source: 'manual',
  });
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

test('Profiles page: a copied share code imports into slot 3 through the page', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.evaluate(async () => {
    const p = await window.dualforge.profiles.get('p1');
    p.sticks.left.deadzone.anti = 0.25;
    await window.dualforge.profiles.set(p);
    // never touch the real clipboard: capture what Copy code would write
    const w = window as unknown as { copied: string };
    w.copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (t: string) => {
          w.copied = t;
        },
      },
    });
  });
  await page.getByRole('button', { name: 'Open Profiles' }).click();
  await expect(page.getByRole('article')).toHaveCount(4);
  await expect(page.getByRole('textbox', { name: 'Share code for Profile 1' })).toHaveValue(
    /^DUALFORGE:/,
  );
  await page.getByRole('button', { name: 'Copy code' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const code = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(code).toBe(
    await page.getByRole('textbox', { name: 'Share code for Profile 1' }).inputValue(),
  );

  await page.getByRole('textbox', { name: 'Paste a share code' }).fill(code);
  await page
    .getByRole('radiogroup', { name: 'Import into' })
    .getByRole('radio', { name: 'Profile 3' })
    .click();
  await page.getByRole('button', { name: 'Import code' }).click();
  await expect(page.getByText('Imported into slot 3 as Profile 1.')).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Slot 3' }).getByRole('heading', { name: 'Profile 1' }),
  ).toBeVisible();
  const p3 = await page.evaluate(() => window.dualforge.profiles.get('p3'));
  expect(p3.id).toBe('p3');
  expect(p3.sticks.left.deadzone.anti).toBe(0.25);

  await page.getByRole('textbox', { name: 'Paste a share code' }).fill('DUALFORGE:not-a-real-code');
  await page.getByRole('button', { name: 'Import code' }).click();
  await expect(page.getByRole('alert')).toContainText('not a DualForge share code');
  await app.close();
});

test('Profiles page: an auto-switch rule is saved in settings, survives a reload and can be removed', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Open Profiles' }).click();
  await page.getByRole('button', { name: 'Pick running game' }).click();
  const pick = page.getByRole('dialog', { name: 'Pick a running game' });
  await expect(pick.locator('.pick-item').first()).toBeVisible({ timeout: 10_000 }); // real tasklist output, read-only
  await page.keyboard.press('Escape');
  await expect(pick).toBeHidden();

  await page.getByRole('textbox', { name: 'Game executable' }).fill('  EldenRing.EXE ');
  await page
    .getByRole('radiogroup', { name: 'Profile for this game' })
    .getByRole('radio', { name: 'Profile 4' })
    .click();
  await page.getByRole('button', { name: 'Add rule' }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.dualforge.settings.get())).autoSwitch)
    .toEqual([{ exe: 'eldenring.exe', profileId: 'p4' }]);
  await page.reload();
  await page.getByRole('button', { name: 'Open Profiles' }).click();
  await expect(page.getByRole('row', { name: 'eldenring.exe → Profile 4' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove rule for eldenring.exe' }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.dualforge.settings.get())).autoSwitch)
    .toEqual([]);
  await expect(page.getByText('No games yet. Add one below.')).toBeVisible();
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
  await expect(
    page.getByRole('tablist', { name: 'Profiles' }).getByRole('tab', { name: 'Racing' }),
  ).toBeVisible();
  expect(
    (await page.evaluate(() => window.dualforge.profiles.list())).find((s) => s.id === 'p2')?.name,
  ).toBe('Racing');
  await app.close();
});

test('Settings page: Light theme re-themes the app and is saved', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Open Settings' }).click();
  await page
    .getByRole('radiogroup', { name: 'Theme' })
    .getByRole('radio', { name: 'Light' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(
    await page.locator('header.header').evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe('rgb(255, 255, 255)');
  expect((await page.evaluate(() => window.dualforge.settings.get())).theme).toBe('light');
  await page.getByRole('switch', { name: 'This controller has rumble motors' }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.dualforge.settings.get())).hasRumble)
    .toBe(true);
  await app.close();
});

test('Overview dashboard: five tiles around the pad, Lights animation edits the engine profile', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('tab', { name: 'Overview' }).click();
  for (const name of ['Lights', 'Motion', 'Triggers', 'Sticks', 'Buttons'])
    await expect(page.getByRole('region', { name })).toBeVisible();
  await expect(page.locator('.ov-stage .ds-art')).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Light animation' })
    .getByRole('radio', { name: 'Rainbow' })
    .click();
  await expect
    .poll(async () => (await page.evaluate(() => window.dualforge.getProfile())).lights.mode, {
      timeout: 2000,
    })
    .toBe('rainbow');
  await page.getByRole('button', { name: 'Open Motion' }).click();
  await expect(page.getByRole('tab', { name: 'Motion' })).toHaveAttribute('aria-selected', 'true');
  await app.close();
});

test('Buttons page: map square to B in the mapping dialog; the replayed cross still drives A', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('tab', { name: 'Buttons' }).click();
  await expect(page.locator('.lead-line')).toHaveCount(19);
  await page.getByRole('button', { name: /^Map □:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Remap □' });
  await dialog.getByRole('button', { name: 'B', exact: true }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Map □: B' })).toBeVisible();
  await expect
    .poll(async () => (await page.evaluate(() => window.dualforge.getProfile())).mappings.square, {
      timeout: 2000,
    })
    .toEqual({
      targets: [{ type: 'xbutton', button: 'B' }],
      turbo: { mode: 'off', hz: 12 },
      continuous: false,
    });

  await page.getByRole('tab', { name: 'Input Test' }).click();
  await page.evaluate(
    (f) => window.dualforge.replay(f),
    resolve(import.meta.dirname, '../../../packages/engine/test/fixtures/stick-sweep.hidlog'),
  );
  const xA = page.locator('.btn-grid').last().locator('.cell', { hasText: /^A$/ });
  await expect(xA).toHaveClass(/\bon\b/, { timeout: 5000 });
  expect((await page.evaluate(() => window.dualforge.getProfile())).mappings.cross.targets).toEqual(
    [{ type: 'xbutton', button: 'A' }],
  );
  await app.close();
});

test('Macros page: a macro built in the editor is saved, listed and can be assigned to a button', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('tab', { name: 'Macros' }).click();
  await expect(page.getByText('No macros yet')).toBeVisible();
  await page.getByRole('button', { name: 'New macro' }).click();
  const ed = page.getByRole('dialog', { name: 'New macro' });
  await ed.getByRole('textbox', { name: 'Macro name' }).fill('Combo');
  await ed.getByRole('button', { name: 'Add step' }).click();
  await ed.getByRole('button', { name: 'Step 2 output: A' }).click();
  const picker = page.getByRole('dialog', { name: 'Step 2 output' });
  await picker.getByRole('button', { name: 'Y', exact: true }).click();
  await ed.getByRole('spinbutton', { name: 'Step 2 hold (ms)' }).fill('120');
  await ed.getByRole('button', { name: 'Play test' }).click(); // saves, then runs it on the engine
  await page
    .getByRole('dialog', { name: 'Edit macro' })
    .getByRole('button', { name: 'Save' })
    .click();
  await expect(page.getByRole('article', { name: 'Combo' })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.dualforge.getProfile())).macros.map((m) => [
          m.name,
          m.steps.length,
          m.steps[1]?.holdMs,
        ]),
      { timeout: 2000 },
    )
    .toEqual([['Combo', 2, 120]]);

  await page.getByRole('tab', { name: 'Buttons' }).click();
  await page.getByRole('button', { name: /^Map R3:/ }).click();
  const map = page.getByRole('dialog', { name: 'Remap R3' });
  await map.getByRole('tab', { name: 'Macro' }).click();
  await map.getByRole('button', { name: 'Combo' }).click();
  await map.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Map R3: ⟨macro⟩ Combo' })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.dualforge.getProfile())).mappings.r3?.targets[0]?.type,
      { timeout: 2000 },
    )
    .toBe('macro');
  await app.close();
});

test('Macro Play test drives the virtual pad: a 600 ms B step shows up in the engine output', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('tab', { name: 'Macros' }).click();
  await page.getByRole('button', { name: 'New macro' }).click();
  const ed = page.getByRole('dialog', { name: 'New macro' });
  await ed.getByRole('textbox', { name: 'Macro name' }).fill('Tap B');
  await ed.getByRole('button', { name: 'Step 1 output: A' }).click();
  await page
    .getByRole('dialog', { name: 'Step 1 output' })
    .getByRole('button', { name: 'B', exact: true })
    .click();
  await ed.getByRole('spinbutton', { name: 'Step 1 hold (ms)' }).fill('600');
  await ed.getByRole('spinbutton', { name: 'Step 1 hold (ms)' }).press('Enter');
  // reports must flow for the pipeline to tick; the fixture never presses circle, so B is the macro's alone. Started only
  // now: its cross pulses are the pad's A, which gamepad navigation would turn into clicks on the editor's focused button.
  await page.evaluate(
    (f) => window.dualforge.replay(f),
    resolve(import.meta.dirname, '../../../packages/engine/test/fixtures/stick-sweep.hidlog'),
  );

  type Probe = { sawB: number[]; clickAt: number };
  await page.evaluate(() => {
    const w = window as unknown as Probe;
    w.sawB = [];
    window.dualforge.onEngineEvent((e) => {
      if (e.type === 'snapshot' && e.snapshot.out.buttons.B) w.sawB.push(performance.now());
    });
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as Probe).sawB.length)).toBe(0);
  await page.evaluate(() => {
    (window as unknown as Probe).clickAt = performance.now();
  });
  await ed.getByRole('button', { name: 'Play test' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Probe).sawB.length), { timeout: 1500 })
    .toBeGreaterThan(0);
  const lag = await page.evaluate(() => {
    const w = window as unknown as Probe;
    return w.sawB[0]! - w.clickAt;
  });
  expect(lag).toBeLessThan(500);
  await app.close();
});

test('Motion page: Aim with Mouse output and a horizontal sensitivity reach the engine profile', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('tab', { name: 'Motion' }).click();
  await page
    .getByRole('radiogroup', { name: 'Motion mode' })
    .getByRole('radio', { name: 'Aim' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Output' })
    .getByRole('radio', { name: 'Mouse' })
    .click();
  await setRange(page, 'Horizontal sensitivity', 3.5);
  await page.waitForTimeout(200);
  const p = await page.evaluate(() => window.dualforge.getProfile());
  expect(p.gyro.output).toBe('mouse');
  expect(p.gyro.sensitivityX).toBe(3.5);
  expect(p.gyro.sensitivityY).toBe(1);
  await app.close();
});

test('Vibrations page: the rumble motors switch is saved in settings, on and off again', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('tab', { name: 'Vibrations' }).click();
  const sw = page.getByRole('switch', { name: 'This controller has rumble motors' });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('slider', { name: 'Left motor strength' })).toBeDisabled();
  await sw.click();
  await expect
    .poll(() => page.evaluate(async () => (await window.dualforge.settings.get()).hasRumble))
    .toBe(true);
  await expect(page.getByRole('slider', { name: 'Left motor strength' })).toBeEnabled();
  await page.getByRole('button', { name: 'Test left motor' }).click();
  await sw.click();
  await expect
    .poll(() => page.evaluate(async () => (await window.dualforge.settings.get()).hasRumble))
    .toBe(false);
  await app.close();
});

test('Lights page: Rainbow animation and player LEDs reach the engine profile', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('tab', { name: 'Lights' }).click();
  await page
    .getByRole('radiogroup', { name: 'Light animation' })
    .getByRole('radio', { name: 'Rainbow' })
    .click();
  await page.getByRole('tab', { name: 'Player LEDs' }).click();
  const before = await page.evaluate(
    async () => (await window.dualforge.getProfile()).lights.playerLeds,
  );
  await page.getByRole('switch', { name: 'Player LED 1' }).click();
  await page.waitForTimeout(200);
  const p = await page.evaluate(() => window.dualforge.getProfile());
  expect(p.lights.mode).toBe('rainbow');
  expect(p.lights.playerLeds).toBe(before ^ 1);
  await app.close();
});

test('Health page: the attached DualSense is OK, HidHide is reported (warns when not installed), Run checks now runs the checks', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  // the first connected snapshot routes Home → Overview: the real pad is up before the checks run
  await expect(
    page
      .getByRole('tablist', { name: 'Sections' })
      .getByRole('tab', { name: 'Overview', exact: true }),
  ).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Open Health' }).click();
  await expect(page.getByRole('heading', { name: 'Health', exact: true })).toBeVisible();
  const before = (await page.evaluate(() => window.dualforge.health.get())).ranAt;
  await page.getByRole('button', { name: 'Run checks now' }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.dualforge.health.get())).ranAt, {
      timeout: 15_000,
    })
    .toBeGreaterThan(before);

  const device = page.getByRole('article', { name: 'DualSense connected' });
  await expect(device.getByRole('img', { name: 'OK' })).toBeVisible({ timeout: 10_000 });
  if (existsSync(HIDHIDE_CLI)) {
    // the machine has HidHide installed: the check reports on it (state depends on the machine), never "not installed"
    await expect(page.getByRole('article', { name: /^HidHide/ }).first()).toBeVisible();
    await expect(page.getByRole('article', { name: 'HidHide not installed' })).toHaveCount(0);
  } else {
    const hid = page.getByRole('article', { name: 'HidHide not installed' });
    await expect(hid.getByRole('img', { name: 'Warning' })).toBeVisible();
    await expect(hid.getByRole('button', { name: 'Install HidHide' })).toBeEnabled(); // offered, never clicked here
  }
  await expect(page.getByTestId('health-lamp')).toHaveClass(/warn|error/);
  await expect(
    page.getByRole('region', { name: 'Recent log lines' }).getByRole('listitem').first(),
  ).toBeVisible();
  await expect(page.locator('.footer .version')).toHaveText('V0.3.1');
  await app.close();
});

const FIXTURE = resolve(
  import.meta.dirname,
  '../../../packages/engine/test/fixtures/stick-sweep.hidlog',
);

test('Home: the first connected controller routes to Overview once; Home stays reachable afterwards', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  const tab = (name: string) =>
    page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name, exact: true });
  expect(await page.evaluate(() => window.dualforge.flags.navReplay)).toBe(false); // replay cannot drive navigation here
  await page.evaluate((f) => window.dualforge.replay(f), FIXTURE);
  await expect(tab('Overview')).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
  await tab('Home').click();
  await expect(page.getByText(/^Connected · Replay · Battery \d+%$/)).toBeVisible({
    timeout: 5000,
  });
  await page.waitForTimeout(500); // snapshots keep arriving: the auto-route must not fire again
  await expect(tab('Home')).toHaveAttribute('aria-selected', 'true');
  await app.close();
});

test('Gamepad navigation: the replayed raw cross clicks the focused tab', async () => {
  // replayed input drives navigation only with this opt-in; every other test launches without it
  const app = await launchApp({ DUALFORGE_NAV_REPLAY: '1' });
  const page = await app.firstWindow();
  expect(await page.evaluate(() => window.dualforge.flags.navReplay)).toBe(true);
  // navigation only listens while the window has focus (it never reacts to a game's input)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.focus());
  const tab = (name: string) =>
    page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name, exact: true });
  await tab('Buttons').click();
  await expect(tab('Buttons')).toHaveAttribute('aria-selected', 'true');
  await tab('Overview').focus();
  await page.waitForTimeout(300);
  await expect(tab('Buttons')).toHaveAttribute('aria-selected', 'true'); // focus alone does not switch
  await page.evaluate((f) => window.dualforge.replay(f), FIXTURE);
  await expect(tab('Overview')).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Overview');
  await app.close();
});

const CROSS_HELD = resolve(
  import.meta.dirname,
  '../../../packages/engine/test/fixtures/cross-held.hidlog',
);

/**
 * Watches the virtual A over `ms` of replay snapshots: rising edges, how many snapshots had it down, the replay's report
 * rate (reports per real second) and whether the engine said turbo was firing.
 */
function watchA(page: Page, ms: number) {
  return page.evaluate(
    (ms) =>
      new Promise<{ edges: number; on: number; samples: number; hz: number; active: boolean }>(
        (done) => {
          let prev: boolean | null = null;
          const r = { edges: 0, on: 0, samples: 0, hz: 0, active: false };
          const off = window.dualforge.onEngineEvent((e) => {
            if (e.type !== 'snapshot' || !e.snapshot.connected || e.snapshot.source !== 'replay')
              return;
            const a = e.snapshot.out.buttons.A === true;
            if (prev === false && a) r.edges++;
            prev = a;
            r.samples++;
            if (a) r.on++;
            r.hz = e.snapshot.reportHz;
            r.active ||= e.snapshot.turboActive === true;
          });
          setTimeout(() => {
            off();
            done(r);
          }, ms);
        },
      ),
    ms,
  );
}

test('Turbo page: Hold 20 Hz on cross makes a held cross blink A at 20 Hz', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Turbo' }).click();
  await page.getByRole('button', { name: 'Turbo ✕: Off' }).click();
  const dlg = page.getByRole('dialog', { name: 'Turbo ✕' });
  await dlg.getByRole('radio', { name: 'Hold' }).click();
  await dlg.getByRole('radio', { name: 'Fast 20' }).click();
  await dlg.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Turbo ✕: Hold 20 Hz' })).toBeVisible();
  await expect
    .poll(async () => (await page.evaluate(() => window.dualforge.getProfile())).mappings.cross)
    .toMatchObject({ turbo: { mode: 'hold', hz: 20 } });

  // The fixture holds cross down the whole time, one frame per 2 ms of log time: only turbo can make A blink. Turbo runs
  // on report time and a replay delivers one frame per timer tick, so 20 Hz of report time is
  // 20 × reportHz × 2 / 1000 blinks per real second.
  await page.evaluate((f) => window.dualforge.replay(f), CROSS_HELD);
  await expect(page.getByRole('status').filter({ hasText: /^Turbo / })).toHaveText('Turbo active', {
    timeout: 5000,
  });
  await page.waitForTimeout(1200); // reportHz needs one full 1 s window
  const SECS = 3;
  const r = await watchA(page, SECS * 1000);
  expect(r.active).toBe(true);
  expect(r.on / r.samples).toBeGreaterThan(0.3); // 50 % duty
  expect(r.on / r.samples).toBeLessThan(0.7);
  expect(r.edges).toBeGreaterThanOrEqual(2);
  const expected = ((20 * r.hz * 2) / 1000) * SECS;
  // snapshots come at most ~60 per second: the edge count is exact only when they sample each blink several times
  if (r.samples >= 4 * expected) expect(Math.abs(r.edges - expected)).toBeLessThanOrEqual(4);

  // control: turbo off, the same held cross is one long press
  await page.getByRole('button', { name: 'Clear all turbo' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Turbo / })).toHaveText('Turbo idle', {
    timeout: 5000,
  });
  const c = await watchA(page, 1000);
  expect(c.edges).toBeLessThanOrEqual(1);
  expect(c.on / c.samples).toBeGreaterThan(0.95);
  await app.close();
});
