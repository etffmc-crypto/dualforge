import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  defaultExec,
  HealthAdapterError,
  HIDHIDE_STUCK_MARKER,
  needsElevation,
} from '../src/main/health/adapters.js';
import {
  composeElevatedCloakOff,
  composeElevatedSetup,
  createHidHide,
  createHidHideQueue,
  isAccessDenied,
  parseDualSenseInstance,
  parseLines,
  DUALSENSE_INSTANCE,
  type HidHideResult,
} from '../src/main/hidhide.js';

const CLI = 'C:\\Program Files\\Nefarius Software Solutions\\HidHide\\x64\\HidHideCLI.exe';
const INSTANCE = 'HID\\VID_054C&PID_0CE6&MI_03\\B&15810585&0&0000';
const EXE = 'C:\\app\\DualForge.exe';
const DATA = 'C:\\data\\DualForge';
const SETUP = join(DATA, 'hidhide-setup.cmd');
/** One PnP line per HID collection: InstanceId|CompatibleIDs (;-joined)|FriendlyName. */
const GAME_LINE = `${INSTANCE}|HID_DEVICE_SYSTEM_GAME;HID_DEVICE_UP:0001_U:0005;HID_DEVICE|HID-compliant game controller`;
const denied = () => Object.assign(new Error('Command failed'), { code: 5, stderr: '' });

function rig(
  opts: {
    installed?: boolean;
    pnp?: string;
    fail?: (args: string[]) => boolean;
    failWith?: (args: string[]) => Error | null;
    devList?: string;
    elevation?: 'accept' | 'decline';
    cloaked?: () => boolean;
    /** The stuck marker a previous session's failed quit cloak-off left in the data dir. */
    stuckMarker?: boolean;
  } = {},
) {
  const calls: { file: string; args: string[] }[] = [];
  const writes: { path: string; data: string }[] = [];
  const stuck: boolean[] = [];
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const exec = vi.fn(async (file: string, args: string[]) => {
    calls.push({ file, args });
    if (opts.fail?.(args)) throw new Error('access denied');
    const err = opts.failWith?.(args);
    if (err) throw err;
    if (file === CLI)
      return {
        stdout:
          args[0] === '--dev-list'
            ? (opts.devList ?? '')
            : args[0] === '--app-list'
              ? `"C:\\Games\\a.exe"\r\n${EXE}\r\n`
              : '',
      };
    if (args.join(' ').includes('Start-Process')) {
      if (opts.elevation === 'decline')
        throw Object.assign(new Error('The operation was canceled by the user.'), { code: 1 });
      return { stdout: '' };
    }
    return { stdout: opts.pnp ?? `${GAME_LINE}\r\n` }; // PowerShell PnP query
  });
  const h = createHidHide({
    exec,
    exists: (p) =>
      ((opts.installed ?? true) && p === CLI) ||
      (!!opts.stuckMarker && p === join(DATA, HIDHIDE_STUCK_MARKER)),
    ownExe: EXE,
    programFiles: 'C:\\Program Files',
    dataDir: DATA,
    writeFile: (path, data) => writes.push({ path, data }),
    onCloakStuck: (s) => stuck.push(s),
    ...(opts.cloaked ? { cloakedThisSession: opts.cloaked } : {}),
    log,
  });
  return { h, calls, log, exec, writes, stuck };
}
const cli = (calls: { file: string; args: string[] }[]) =>
  calls.filter((c) => c.file === CLI).map((c) => c.args);

describe('hidhide', () => {
  it('findCli returns the Program Files path, or null when HidHide is not installed', () => {
    expect(rig().h.findCli()).toBe(CLI);
    expect(rig({ installed: false }).h.findCli()).toBeNull();
  });

  it('composes the documented CLI commands', async () => {
    const { h, calls } = rig();
    await h.appRegister(EXE);
    await h.devHide(INSTANCE);
    await h.cloak(true);
    await h.cloak(false);
    expect(cli(calls)).toEqual([
      ['--app-reg', EXE],
      ['--dev-hide', INSTANCE],
      ['--cloak-on'],
      ['--cloak-off'],
    ]);
  });

  it('parses --app-list and --dev-list output (quotes, blanks, CRLF)', async () => {
    const { h } = rig({ devList: `${INSTANCE}\r\n\r\n` });
    expect(await h.appList()).toEqual(['C:\\Games\\a.exe', EXE]);
    expect(await h.devList()).toEqual([INSTANCE]);
    expect(parseLines('\n  "x"  \n\n')).toEqual(['x']);
  });

  it('enable: registers the exe, hides the pad found through PnP, then cloaks on (in that order)', async () => {
    const { h, calls } = rig();
    expect(await h.enable()).toEqual({ ok: true });
    expect(cli(calls)).toEqual([
      ['--app-reg', EXE],
      ['--dev-list'],
      ['--dev-hide', INSTANCE],
      ['--cloak-on'],
    ]);
    expect(calls.find((c) => c.file !== CLI)!.args.join(' ')).toContain('Get-PnpDevice');
  });

  it('enable skips --dev-hide when the pad is already hidden', async () => {
    const { h, calls } = rig({ devList: INSTANCE });
    await h.enable();
    expect(cli(calls)).toEqual([['--app-reg', EXE], ['--dev-list'], ['--cloak-on']]);
  });

  it('enable reports E_HIDHIDE_NOT_INSTALLED without running anything', async () => {
    const { h, exec } = rig({ installed: false });
    expect(await h.enable()).toMatchObject({ ok: false, code: 'E_HIDHIDE_NOT_INSTALLED' });
    expect(exec).not.toHaveBeenCalled();
  });

  it('enable reports E_HIDHIDE_NO_DEVICE when PnP finds no DualSense, and never cloaks', async () => {
    const { h, calls } = rig({ pnp: '\r\n' });
    expect(await h.enable()).toMatchObject({ ok: false, code: 'E_HIDHIDE_NO_DEVICE' });
    expect(cli(calls)).not.toContainEqual(['--cloak-on']);
  });

  it('refuses a PnP result that is not a DualSense HID instance path', async () => {
    const { h, calls } = rig({ pnp: 'USB\\VID_1234&PID_5678\\X\r\n' });
    expect(await h.enable()).toMatchObject({ ok: false, code: 'E_HIDHIDE_NO_DEVICE' });
    expect(cli(calls).some((a) => a[0] === '--dev-hide')).toBe(false);
    expect(DUALSENSE_INSTANCE.test(INSTANCE)).toBe(true);
  });

  it('a failing CLI call becomes E_HIDHIDE_CLI and is logged', async () => {
    const { h, log } = rig({ fail: (a) => a[0] === '--cloak-on' });
    expect(await h.enable()).toMatchObject({ ok: false, code: 'E_HIDHIDE_CLI' });
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_HIDHIDE_CLI' }));
  });

  it('disable is cloak-off only (registrations stay); not installed is a quiet success', async () => {
    const { h, calls } = rig();
    expect(await h.disable()).toEqual({ ok: true });
    expect(cli(calls)).toEqual([['--cloak-off']]);
    expect(await rig({ installed: false }).h.disable()).toEqual({ ok: true });
  });

  it('disable surfaces E_HIDHIDE_CLI when cloak-off fails', async () => {
    expect(await rig({ fail: () => true }).h.disable()).toMatchObject({
      ok: false,
      code: 'E_HIDHIDE_CLI',
    });
  });
});

describe('hidhide device lookup (locale-independent)', () => {
  it('picks the game-controller collection by compatible ID, whatever language the FriendlyName is in', () => {
    const pnp = [
      'HID\\VID_054C&PID_0CE6&MI_03\\B&15810585&0&0001|HID_DEVICE_SYSTEM_VENDOR;HID_DEVICE_UP:FF00_U:0001;HID_DEVICE|HID-konformes, vom Hersteller definiertes Gerät',
      `${INSTANCE}|HID_DEVICE_SYSTEM_GAME;HID_DEVICE_UP:0001_U:0005;HID_DEVICE|HID-konformer Gamecontroller`,
    ].join('\r\n');
    expect(parseDualSenseInstance(pnp)).toBe(INSTANCE);
    // the English name alone is not enough, and a non-DualSense game controller is refused
    expect(parseDualSenseInstance(`${INSTANCE}|HID_DEVICE|HID-compliant game controller`)).toBe(
      null,
    );
    expect(parseDualSenseInstance('HID\\VID_045E&PID_028E\\1|HID_DEVICE_UP:0001_U:0005|Xbox')).toBe(
      null,
    );
  });

  it('accepts a pad HidHide already hides: its compatible-ID list comes back empty (field output, 0.3.6)', () => {
    // exact Get-PnpDevice line from a PC where HidHide hid the DualSense before DualForge was whitelisted
    const hidden = 'HID\\VID_054C&PID_0CE6&MI_03\\B&15810585&0&0000||HID-compliant game controller';
    expect(parseDualSenseInstance(hidden)).toBe('HID\\VID_054C&PID_0CE6&MI_03\\B&15810585&0&0000');
    // a visible game-controller collection still wins over a hidden one, and a non-DualSense with no IDs is refused
    expect(parseDualSenseInstance(`${hidden}\r\n${INSTANCE}|HID_DEVICE_UP:0001_U:0005|x`)).toBe(
      INSTANCE,
    );
    expect(parseDualSenseInstance('HID\\VID_045E&PID_028E\\1||Xbox')).toBe(null);
  });

  it('the PnP query filters by instance id and compatible id, not by FriendlyName', async () => {
    const { h, calls } = rig({
      pnp: `${INSTANCE}|HID_DEVICE_UP:0001_U:0005|Contrôleur de jeu HID\r\n`,
    });
    expect(await h.findDualSenseInstance()).toBe(INSTANCE);
    const q = calls.find((c) => c.file !== CLI)!.args.join(' ');
    expect(q).toContain("-like 'HID\\VID_054C&PID_0CE6*'");
    expect(q).toContain('HID_DEVICE_UP:0001_U:0005');
    expect(q).not.toContain('FriendlyName -eq');
  });
});

describe('hidhide without admin rights', () => {
  it('detects the access-denied signature (exit code 5 or "Access is denied")', () => {
    expect(isAccessDenied(Object.assign(new Error('Command failed'), { code: 5 }))).toBe(true);
    expect(
      isAccessDenied(
        Object.assign(new Error('Command failed'), { code: 1, stderr: 'Access is denied.\r\n' }),
      ),
    ).toBe(true);
    expect(isAccessDenied(new Error('Command failed: HidHideCLI.exe\nAccess is denied.'))).toBe(
      true,
    );
    expect(isAccessDenied(Object.assign(new Error('boom'), { code: 1 }))).toBe(false);
    expect(isAccessDenied(Object.assign(new Error('spawn'), { code: 'ENOENT' }))).toBe(false);
  });

  it('composes the elevated setup script with the exact --app-reg, --dev-hide, --cloak-on lines', () => {
    expect(composeElevatedSetup(CLI, EXE, INSTANCE).split('\r\n')).toEqual([
      '@echo off',
      `"${CLI}" --app-reg "${EXE}" || exit /b 1`,
      `"${CLI}" --dev-hide "${INSTANCE}" || exit /b 1`,
      `"${CLI}" --cloak-on || exit /b 1`,
      '',
    ]);
    expect(composeElevatedSetup(CLI, 'C:\\100%\\a.exe', INSTANCE)).toContain('C:\\100%%\\a.exe');
  });

  it('enable: access denied writes the setup script to the data dir and runs it once with Start-Process -Verb RunAs -Wait', async () => {
    const r = rig({ failWith: (a) => (a[0] === '--app-reg' ? denied() : null) });
    expect(await r.h.enable()).toEqual({ ok: true });
    expect(r.writes).toEqual([{ path: SETUP, data: composeElevatedSetup(CLI, EXE, INSTANCE) }]);
    const elevated = r.calls.filter((c) => c.args.join(' ').includes('Start-Process'));
    expect(elevated).toHaveLength(1);
    expect(elevated[0]!.args.join(' ')).toContain(
      `Start-Process -FilePath '${SETUP}' -Verb RunAs -Wait`,
    );
    expect(cli(r.calls)).toEqual([['--app-reg', EXE]]); // nothing else is tried unelevated
  });

  it('a declined UAC prompt is E_HIDHIDE_ELEVATION_DECLINED', async () => {
    const r = rig({
      failWith: (a) => (a[0] === '--cloak-on' ? denied() : null),
      elevation: 'decline',
    });
    expect(await r.h.enable()).toMatchObject({ ok: false, code: 'E_HIDHIDE_ELEVATION_DECLINED' });
    expect(r.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'E_HIDHIDE_ELEVATION_DECLINED' }),
    );
  });

  it('quit cloak-off: access denied logs E_HIDHIDE_CLOAK_STUCK and marks it; a later success clears it', async () => {
    const r = rig({ failWith: (a) => (a[0] === '--cloak-off' ? denied() : null) });
    expect(await r.h.quitCloakOff()).toMatchObject({ ok: false, code: 'E_HIDHIDE_CLOAK_STUCK' });
    expect(r.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'E_HIDHIDE_CLOAK_STUCK' }),
    );
    expect(r.stuck).toEqual([true]);
    expect(r.calls.some((c) => c.args.join(' ').includes('Start-Process'))).toBe(false); // never prompts on quit
    const ok = rig();
    expect(await ok.h.quitCloakOff()).toEqual({ ok: true });
    expect(ok.stuck).toEqual([false]);
  });
});

describe('hidhide residual: disable elevation, stuck marker, decline latch', () => {
  const elevatedCalls = (r: ReturnType<typeof rig>) =>
    r.calls.filter((c) => c.args.join(' ').includes('Start-Process'));

  it('disable: access denied runs an elevated --cloak-off script once', async () => {
    const r = rig({ failWith: (a) => (a[0] === '--cloak-off' ? denied() : null) });
    expect(await r.h.disable()).toEqual({ ok: true });
    expect(r.writes).toHaveLength(1);
    expect(r.writes[0]!.data.split('\r\n')).toEqual([
      '@echo off',
      `"${CLI}" --cloak-off || exit /b 1`,
      '',
    ]);
    expect(elevatedCalls(r)).toHaveLength(1);
  });

  it('disable: a declined prompt is E_HIDHIDE_ELEVATION_DECLINED', async () => {
    const r = rig({
      failWith: (a) => (a[0] === '--cloak-off' ? denied() : null),
      elevation: 'decline',
    });
    expect(await r.h.disable()).toMatchObject({
      ok: false,
      code: 'E_HIDHIDE_ELEVATION_DECLINED',
    });
  });

  it('quit: the stuck marker is written only when this session cloaked', async () => {
    const r = rig({
      failWith: (a) => (a[0] === '--cloak-off' ? denied() : null),
      cloaked: () => false,
    });
    expect(await r.h.quitCloakOff()).toMatchObject({ ok: false, code: 'E_HIDHIDE_CLOAK_STUCK' });
    expect(r.stuck).toEqual([]);
  });

  it('after a decline, startup and converge do not prompt again; a user enable does', async () => {
    const r = rig({
      failWith: (a) => (a[0] === '--cloak-on' ? denied() : null),
      elevation: 'decline',
    });
    expect(await r.h.enable()).toMatchObject({ code: 'E_HIDHIDE_ELEVATION_DECLINED' });
    expect(elevatedCalls(r)).toHaveLength(1);
    expect(await r.h.startup()).toMatchObject({ code: 'E_HIDHIDE_ELEVATION_DECLINED' });
    expect(await r.h.enable({ auto: true })).toMatchObject({
      code: 'E_HIDHIDE_ELEVATION_DECLINED',
    });
    expect(elevatedCalls(r)).toHaveLength(1); // latched: no new UAC prompt
    await r.h.enable(); // user-initiated: clears the latch and prompts again
    expect(elevatedCalls(r)).toHaveLength(2);
  });
});

describe('hidhide: a CLI that hangs unelevated takes the elevated path (0.3.5)', () => {
  /** What defaultExec rejects with when HidHideCLI never answers (seen on a real PC for --app-reg). */
  const hang = () => new HealthAdapterError('E_HEALTH_TIMEOUT', `${CLI} timed out after 5000 ms`);
  const elevatedCalls = (r: ReturnType<typeof rig>) =>
    r.calls.filter((c) => c.args.join(' ').includes('Start-Process'));

  it('the shared classification: denied codes/texts and timeouts need elevation, other failures do not', () => {
    expect(needsElevation(hang())).toBe(true);
    expect(needsElevation(new Error('x.exe timed out after 5000 ms'))).toBe(true);
    for (const code of [5, 740, 'EACCES', 'EPERM', 'UNKNOWN'])
      expect(needsElevation(Object.assign(new Error('Command failed'), { code }))).toBe(true);
    expect(needsElevation(Object.assign(new Error('spawn'), { errno: -4094 }))).toBe(true);
    expect(needsElevation(new Error('The requested operation requires elevation.'))).toBe(true);
    expect(needsElevation(Object.assign(new Error('boom'), { code: 1 }))).toBe(false);
    expect(needsElevation(Object.assign(new Error('spawn'), { code: 'ENOENT' }))).toBe(false);
    expect(isAccessDenied(hang())).toBe(false); // a hang is not a refusal, but both need elevation
  });

  it('enable: --app-reg hangs → the composed setup script runs elevated, the toggle succeeds', async () => {
    const r = rig({ failWith: (a) => (a[0] === '--app-reg' ? hang() : null) });
    expect(await r.h.enable()).toEqual({ ok: true });
    expect(r.writes).toEqual([{ path: SETUP, data: composeElevatedSetup(CLI, EXE, INSTANCE) }]);
    expect(elevatedCalls(r)).toHaveLength(1);
    expect(elevatedCalls(r)[0]!.args.join(' ')).toContain(
      `Start-Process -FilePath '${SETUP}' -Verb RunAs -Wait`,
    );
    expect(cli(r.calls)).toEqual([['--app-reg', EXE]]); // no second unelevated call waits another 5 s
    expect(r.log.warn).toHaveBeenCalledTimes(1);
    expect(r.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'HIDHIDE_CLI_HANG', args: ['--app-reg', EXE] }),
    );
    expect(r.log.error).not.toHaveBeenCalled();
  });

  it('a real hanging child process, killed by defaultExec at its timeout, takes the elevated path', async () => {
    // the CLI is a node process that never answers; defaultExec's real timeout/kill produces the error (300 ms here)
    const writes: string[] = [];
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    let elevated = 0;
    const h = createHidHide({
      exec: (file, args) => {
        if (file === CLI)
          return defaultExec(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
            timeoutMs: 300,
          });
        if (args.join(' ').includes('Start-Process')) {
          elevated++;
          return Promise.resolve({ stdout: '' });
        }
        return Promise.resolve({ stdout: `${GAME_LINE}\r\n` });
      },
      exists: (p) => p === CLI,
      ownExe: EXE,
      programFiles: 'C:\\Program Files',
      dataDir: DATA,
      writeFile: (_p, data) => writes.push(data),
      log,
    });
    expect(await h.enable()).toEqual({ ok: true });
    expect(elevated).toBe(1);
    expect(writes).toEqual([composeElevatedSetup(CLI, EXE, INSTANCE)]);
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ code: 'HIDHIDE_CLI_HANG' }));
  });

  it('enable: a hang later in the sequence (--cloak-on) also falls back to the elevated setup', async () => {
    const r = rig({ failWith: (a) => (a[0] === '--cloak-on' ? hang() : null) });
    expect(await r.h.enable()).toEqual({ ok: true });
    expect(elevatedCalls(r)).toHaveLength(1);
  });

  it('startup: a hung CLI with the pad absent skips (no second hang on --dev-list, no prompt)', async () => {
    const r = rig({ pnp: '', failWith: (a) => (a[0] === '--app-reg' ? hang() : null) });
    expect(await r.h.startup()).toEqual({ ok: true, skipped: true });
    expect(cli(r.calls)).toEqual([['--app-reg', EXE]]);
    expect(elevatedCalls(r)).toHaveLength(0);
  });

  it('disable: --cloak-off hangs → one elevated --cloak-off script', async () => {
    const r = rig({ failWith: (a) => (a[0] === '--cloak-off' ? hang() : null) });
    expect(await r.h.disable()).toEqual({ ok: true });
    expect(r.writes).toEqual([{ path: SETUP, data: composeElevatedCloakOff(CLI) }]);
    expect(elevatedCalls(r)).toHaveLength(1);
    expect(r.stuck).toEqual([false]);
  });

  it('a declined prompt after a hang latches: auto ops never re-prompt, a user click does', async () => {
    const r = rig({
      failWith: (a) => (a[0] === '--app-reg' ? hang() : null),
      elevation: 'decline',
    });
    expect(await r.h.enable()).toMatchObject({ ok: false, code: 'E_HIDHIDE_ELEVATION_DECLINED' });
    expect(await r.h.enable({ auto: true })).toMatchObject({
      code: 'E_HIDHIDE_ELEVATION_DECLINED',
    });
    expect(await r.h.startup()).toMatchObject({ code: 'E_HIDHIDE_ELEVATION_DECLINED' });
    expect(elevatedCalls(r)).toHaveLength(1);
    await r.h.enable();
    expect(elevatedCalls(r)).toHaveLength(2);
  });

  it('startup: hung CLI + stuck marker from the last quit → no elevated setup, HIDHIDE_STILL_CLOAKED logged once', async () => {
    const r = rig({ stuckMarker: true, failWith: (a) => (a[0] === '--app-reg' ? hang() : null) });
    expect(await r.h.startup()).toEqual({ ok: true, skipped: false });
    expect(await r.h.startup()).toEqual({ ok: true, skipped: false });
    expect(elevatedCalls(r)).toHaveLength(0);
    expect(r.writes).toEqual([]);
    const still = r.log.info.mock.calls.filter(
      (c) => (c[0] as { code?: string }).code === 'HIDHIDE_STILL_CLOAKED',
    );
    expect(still).toHaveLength(1);
    expect(r.stuck).toEqual([]); // the marker stays: the cloak really is still on
  });

  it('startup: hung CLI without the marker keeps the one auto UAC prompt per session (none after a decline)', async () => {
    const r = rig({
      failWith: (a) => (a[0] === '--app-reg' ? hang() : null),
      elevation: 'decline',
    });
    expect(await r.h.startup()).toMatchObject({ ok: false, code: 'E_HIDHIDE_ELEVATION_DECLINED' });
    expect(await r.h.startup()).toMatchObject({ ok: false, code: 'E_HIDHIDE_ELEVATION_DECLINED' });
    expect(elevatedCalls(r)).toHaveLength(1);
    const ok = rig({ failWith: (a) => (a[0] === '--app-reg' ? hang() : null) });
    expect(await ok.h.startup()).toEqual({ ok: true });
    expect(elevatedCalls(ok)).toHaveLength(1);
  });

  it('a user enable with the marker present still offers the prompt (the marker only spares startup)', async () => {
    const r = rig({ stuckMarker: true, failWith: (a) => (a[0] === '--app-reg' ? hang() : null) });
    expect(await r.h.enable()).toEqual({ ok: true });
    expect(elevatedCalls(r)).toHaveLength(1);
  });

  it('HIDHIDE_CLI_HANG is logged once per process per args, not on every attempt', async () => {
    const r = rig({
      failWith: (a) => (a[0] === '--app-reg' || a[0] === '--cloak-off' ? hang() : null),
    });
    await r.h.enable();
    await r.h.enable();
    await r.h.disable();
    await r.h.disable();
    const hangs = r.log.warn.mock.calls
      .map((c) => c[0] as { code?: string; args?: string[] })
      .filter((o) => o.code === 'HIDHIDE_CLI_HANG');
    expect(hangs.map((o) => o.args)).toEqual([['--app-reg', EXE], ['--cloak-off']]);
  });

  it('quit: a hung cloak-off never prompts and marks the pad stuck', async () => {
    const r = rig({ failWith: (a) => (a[0] === '--cloak-off' ? hang() : null) });
    expect(await r.h.quitCloakOff()).toMatchObject({ ok: false, code: 'E_HIDHIDE_CLOAK_STUCK' });
    expect(elevatedCalls(r)).toHaveLength(0);
    expect(r.stuck).toEqual([true]);
  });
});

describe('hidhide startup', () => {
  it('pad absent but already in --dev-list: cloaks on without --dev-hide', async () => {
    const r = rig({ pnp: '', devList: INSTANCE });
    expect(await r.h.startup()).toEqual({ ok: true });
    expect(cli(r.calls)).toEqual([['--app-reg', EXE], ['--dev-list'], ['--cloak-on']]);
  });

  it('pad absent and never hidden: skips with an info log, no error, no cloak', async () => {
    const r = rig({ pnp: '' });
    expect(await r.h.startup()).toEqual({ ok: true, skipped: true });
    expect(cli(r.calls)).not.toContainEqual(['--cloak-on']);
    expect(r.log.error).not.toHaveBeenCalled();
    expect(r.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'HIDHIDE_WAIT_DEVICE' }),
    );
  });
});

function qrig() {
  let setting = false;
  let running = 0;
  let maxRunning = 0;
  const cloak: string[] = [];
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const op =
    (name: string, res: HidHideResult = { ok: true }) =>
    async (): Promise<HidHideResult> => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      cloak.push(name);
      running--;
      return res;
    };
  const ops = {
    enable: vi.fn(op('on')),
    startup: vi.fn(op('on')),
    disable: vi.fn(op('off')),
    quitCloakOff: vi.fn(op('quit-off')),
  };
  const q = createHidHideQueue({ hidhide: ops, desired: () => setting, log });
  return {
    q,
    ops,
    cloak,
    log,
    set: (v: boolean) => (setting = v),
    get: () => setting,
    maxRunning: () => maxRunning,
  };
}

describe('hidhide queue', () => {
  it('runs operations one at a time, in order', async () => {
    const r = qrig();
    r.set(true);
    await Promise.all([r.q.enable(), r.q.disable(), r.q.enable()]);
    expect(r.maxRunning()).toBe(1);
  });

  it('startup enable racing a user disable converges to the user value (cloak off)', async () => {
    const r = qrig();
    r.set(true);
    const startup = r.q.startup();
    r.set(false); // the user flips the switch while startup is still running, before any disable is queued
    await startup;
    expect(r.cloak).toEqual(['on', 'off']);
    expect(r.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'HIDHIDE_CONVERGE', to: false }),
    );
  });

  it('a failed or skipped op establishes nothing, so nothing is re-applied', async () => {
    const r = qrig();
    r.ops.startup.mockImplementationOnce(async () => ({ ok: true, skipped: true }));
    r.ops.enable.mockImplementationOnce(async () => ({ ok: false, code: 'E_HIDHIDE_NO_DEVICE' }));
    r.set(false);
    await r.q.startup();
    await r.q.enable();
    expect(r.ops.disable).not.toHaveBeenCalled();
    expect(r.q.cloakedThisSession()).toBe(false);
  });

  it('repair persists the setting inside the queue, so it is not undone by converge', async () => {
    const r = qrig();
    await r.q.repair(() => r.set(true));
    expect(r.get()).toBe(true);
    expect(r.cloak).toEqual(['on']);
  });

  it('quit after a session that cloaked runs cloak-off even when the setting is now false', async () => {
    const r = qrig();
    r.set(true);
    await r.q.enable();
    r.set(false);
    const p = r.q.quitCleanup(r.get());
    expect(p).not.toBeNull();
    await p;
    expect(r.ops.quitCloakOff).toHaveBeenCalledTimes(1);
  });

  it('quit with the setting off and nothing cloaked this session does nothing', () => {
    expect(qrig().q.quitCleanup(false)).toBeNull();
  });
});
