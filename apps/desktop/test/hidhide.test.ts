import { describe, expect, it, vi } from 'vitest';
import { createHidHide, parseLines, DUALSENSE_INSTANCE } from '../src/main/hidhide.js';

const CLI = 'C:\\Program Files\\Nefarius Software Solutions\\HidHide\\x64\\HidHideCLI.exe';
const INSTANCE = 'HID\\VID_054C&PID_0CE6&MI_03\\B&15810585&0&0000';
const EXE = 'C:\\app\\DualForge.exe';

function rig(opts: { installed?: boolean; pnp?: string; fail?: (args: string[]) => boolean; devList?: string } = {}) {
  const calls: { file: string; args: string[] }[] = [];
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const exec = vi.fn(async (file: string, args: string[]) => {
    calls.push({ file, args });
    if (opts.fail?.(args)) throw new Error('access denied');
    if (file === CLI) return { stdout: args[0] === '--dev-list' ? (opts.devList ?? '') : args[0] === '--app-list' ? `"C:\\Games\\a.exe"\r\n${EXE}\r\n` : '' };
    return { stdout: opts.pnp ?? `${INSTANCE}\r\n` };   // PowerShell PnP query
  });
  const h = createHidHide({ exec, exists: (p) => (opts.installed ?? true) && p === CLI, ownExe: EXE, programFiles: 'C:\\Program Files', log });
  return { h, calls, log, exec };
}
const cli = (calls: { file: string; args: string[] }[]) => calls.filter((c) => c.file === CLI).map((c) => c.args);

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
    expect(cli(calls)).toEqual([['--app-reg', EXE], ['--dev-hide', INSTANCE], ['--cloak-on'], ['--cloak-off']]);
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
    expect(cli(calls)).toEqual([['--app-reg', EXE], ['--dev-list'], ['--dev-hide', INSTANCE], ['--cloak-on']]);
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
    expect(await rig({ fail: () => true }).h.disable()).toMatchObject({ ok: false, code: 'E_HIDHIDE_CLI' });
  });
});
