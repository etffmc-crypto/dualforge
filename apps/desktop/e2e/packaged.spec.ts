import { _electron as electron, expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Not part of `npm run check`: needs `npm run dist` first. Run with `npm run test:packaged`.
const UNPACKED = resolve(import.meta.dirname, '../release/win-unpacked');
const EXE = join(UNPACKED, 'DualForge.exe');

/** All log text the app wrote into its (throwaway) data dir. */
function logText(dataDir: string): string {
  const dir = join(dataDir, 'logs');
  let out = '';
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) out += readFileSync(join(dir, f), 'utf8');
  return out;
}

/** A network-level failure of a working updater (offline, DNS, reset, timeout, GitHub 5xx). */
const NETWORK =
  /net::ERR_|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|(?:status(?: code)?|HttpError:?)\s*5\d\d\b/i;

/** The `msg` of every E_UPDATE_CHECK line in the (pino JSON) log. */
function checkFailures(log: string): string[] {
  const out: string[] = [];
  for (const line of log.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line) as { code?: unknown; msg?: unknown };
      if (o.code === 'E_UPDATE_CHECK') out.push(typeof o.msg === 'string' ? o.msg : '');
    } catch {
      /* not a JSON log line */
    }
  }
  return out;
}

/** The packaged exe against a throwaway data dir (which also moves its userData and single-instance lock). */
async function launchPackaged() {
  expect(existsSync(EXE), `run npm run dist first: ${EXE}`).toBe(true);
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && k !== 'DUALFORGE_NAV_REPLAY') env[k] = v;
  const dataDir = mkdtempSync(join(tmpdir(), 'df-pkg-'));
  const app = await electron.launch({
    executablePath: EXE,
    args: [],
    env: { ...env, DUALFORGE_NO_INJECT: '1', DUALFORGE_DATA_DIR: dataDir },
  });
  return { app, dataDir };
}
const flushLogs = () => new Promise((r) => setTimeout(r, 1500)); // the log transport is async

test.describe('packaged app', () => {
  test.skip(
    process.env.DUALFORGE_PACKAGED_E2E !== '1',
    'set DUALFORGE_PACKAGED_E2E=1 (npm run test:packaged)',
  );

  test('ships tray icon + unpacked addon, starts, loads addon, shows Connected', async () => {
    expect(existsSync(join(UNPACKED, 'resources', 'resources', 'tray.png'))).toBe(true);
    expect(
      existsSync(
        join(
          UNPACKED,
          'resources',
          'app.asar.unpacked',
          'node_modules',
          '@dualforge',
          'sendinput',
          'build',
          'Release',
          'sendinput.node',
        ),
      ),
    ).toBe(true);
    const { app, dataDir } = await launchPackaged();
    try {
      expect(await app.evaluate(({ app: a }) => a.isPackaged)).toBe(true);
      const page = await app.firstWindow();
      await expect(page.getByText('DUALFORGE', { exact: true })).toBeVisible();
      await page.getByRole('tab', { name: 'Home' }).click();
      await expect(page.getByText(/Connected/).first()).toBeVisible();
      await flushLogs();
      expect(logText(dataDir)).not.toContain('E_INJECT_LOAD');
    } finally {
      await app.close();
    }
  });

  test('with updates on, "Check now" through the renderer loads electron-updater and gets an answer', async () => {
    // `--dir` builds lack the app-update.yml that the NSIS installer ships; write the same one (from the publish config)
    // so the check goes to the real GitHub feed like the installed app does.
    const updateYml = join(UNPACKED, 'resources', 'app-update.yml');
    const wrote = !existsSync(updateYml);
    if (wrote) {
      const cfg = readFileSync(resolve(import.meta.dirname, '../electron-builder.yml'), 'utf8');
      const pub = cfg.slice(cfg.indexOf('publish:'));
      const field = (k: string) => new RegExp(`^\\s+${k}:\\s*(\\S+)`, 'm').exec(pub)?.[1] ?? '';
      writeFileSync(
        updateYml,
        `owner: ${field('owner')}\nrepo: ${field('repo')}\nprovider: ${field('provider')}\nupdaterCacheDirName: dualforge-updater\n`,
      );
    }
    const { app, dataDir } = await launchPackaged();
    try {
      expect(await app.evaluate(({ app: a }) => a.isPackaged)).toBe(true);
      const page = await app.firstWindow();
      await expect(page.getByText('DUALFORGE', { exact: true })).toBeVisible();
      // The path the installed app takes: opt in, then updates:check over IPC. 0.3.3 / 0.3.4 failed here with
      // E_UPDATE_CHECK "Cannot set properties of undefined (setting 'autoDownload')": the ESM main bundle read
      // electron-updater's CJS getter export as undefined (dev runs stop at E_UPDATE_DEV before loading it).
      const r = await page.evaluate(async () => {
        const df = (
          window as unknown as {
            dualforge: {
              settings: { set(p: object): Promise<unknown> };
              updates: {
                check(): Promise<{ available: boolean; version?: string; code?: string }>;
              };
            };
          }
        ).dualforge;
        await df.settings.set({ updates: true });
        return df.updates.check();
      });
      await flushLogs();
      const log = logText(dataDir);
      const why = `update check result ${JSON.stringify(r)}`;
      expect(log, 'the updater module must load').not.toContain('E_UPDATE_LOAD');
      expect(log).not.toMatch(/Cannot set properties of undefined|autoDownload/);
      expect(r.code, why).not.toBe('E_UPDATE_LOAD');
      expect(r.code, why).not.toBe('E_UPDATE_DEV');
      expect(r.code, why).not.toBe('E_UPDATE_DISABLED');
      // E_UPDATE_CHECK is only acceptable as a network failure of a loaded updater (offline / GitHub unreachable)
      // only the E_UPDATE_CHECK lines' own msg counts, not whatever else is in the log
      if (r.code === 'E_UPDATE_CHECK') {
        const msgs = checkFailures(log);
        expect(msgs.length, 'E_UPDATE_CHECK must be logged').toBeGreaterThan(0);
        for (const m of msgs)
          expect(m, 'E_UPDATE_CHECK must be a network failure').toMatch(NETWORK);
      } else expect(r.code ?? null, why).toBeNull(); // a real answer: up to date or `available`
    } finally {
      await app.close();
      if (wrote) rmSync(updateYml, { force: true });
    }
  });
});
