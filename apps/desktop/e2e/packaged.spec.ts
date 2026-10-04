import { _electron as electron, expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Not part of `npm run check`: needs `npm run dist` first. Run with `npm run test:packaged`.
const UNPACKED = resolve(import.meta.dirname, '../release/win-unpacked');
const EXE = join(UNPACKED, 'DualForge.exe');
const LOG_DIR = join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'DualForge', 'logs');

function logSizes(): Map<string, number> {
  const m = new Map<string, number>();
  if (existsSync(LOG_DIR)) for (const f of readdirSync(LOG_DIR)) m.set(f, statSync(join(LOG_DIR, f)).size);
  return m;
}
/** Log text appended since `before` was taken. */
function logSince(before: Map<string, number>): string {
  let out = '';
  if (!existsSync(LOG_DIR)) return out;
  for (const f of readdirSync(LOG_DIR)) out += readFileSync(join(LOG_DIR, f), 'utf8').slice(before.get(f) ?? 0);
  return out;
}

test.describe('packaged app', () => {
  test.skip(process.env.DUALFORGE_PACKAGED_E2E !== '1', 'set DUALFORGE_PACKAGED_E2E=1 (npm run test:packaged)');

  test('ships tray icon + unpacked addon, starts, loads addon, shows Connected', async () => {
    expect(existsSync(EXE), `run npm run dist first: ${EXE}`).toBe(true);
    expect(existsSync(join(UNPACKED, 'resources', 'resources', 'tray.png'))).toBe(true);
    expect(existsSync(join(UNPACKED, 'resources', 'app.asar.unpacked', 'node_modules', '@dualforge', 'sendinput', 'build', 'Release', 'sendinput.node'))).toBe(true);

    const before = logSizes();
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'DUALFORGE_NAV_REPLAY') env[k] = v;
    const app = await electron.launch({
      executablePath: EXE,
      args: [],
      env: { ...env, DUALFORGE_NO_INJECT: '1', DUALFORGE_DATA_DIR: mkdtempSync(join(tmpdir(), 'df-pkg-')) },
    });
    try {
      expect(await app.evaluate(({ app: a }) => a.isPackaged)).toBe(true);
      const page = await app.firstWindow();
      await expect(page.getByText('DUALFORGE', { exact: true })).toBeVisible();
      await page.getByRole('tab', { name: 'Home' }).click();
      await expect(page.getByText(/Connected/).first()).toBeVisible();
      await new Promise((r) => setTimeout(r, 1500)); // let the async log transport flush
      expect(logSince(before)).not.toContain('E_INJECT_LOAD');
    } finally {
      await app.close();
    }
  });
});
