import { existsSync } from 'node:fs';
import { defaultExec, hidHideCliPath, POWERSHELL_EXE, type Exec } from './health/adapters.js';

export const HIDHIDE_TIMEOUT_MS = 5000;
/** DualSense (0CE6) and DualSense Edge (0DF2) HID instance paths, e.g. HID\VID_054C&PID_0CE6&MI_03\B&15810585&0&0000. */
export const DUALSENSE_INSTANCE = /^HID\\VID_054C&PID_0(?:CE6|DF2)[A-Za-z0-9_&\\]*$/i;

export interface HidHideResult {
  ok: boolean;
  code?: string;
  msg?: string;
}
export interface HidHideDeps {
  exec?: Exec;
  exists?: (p: string) => boolean;
  /** The exe to whitelist: the app itself (the Electron exe in dev); the engine runs as a child of it. */
  ownExe: string;
  programFiles?: string;
  log: { info(o: object): void; warn(o: object): void; error(o: object): void };
}

class HidHideError extends Error {
  constructor(
    readonly code: string,
    msg: string,
  ) {
    super(msg);
  }
}

/** CLI output is one entry per line, sometimes quoted. */
export function parseLines(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^["']+|["']+$/g, ''))
    .filter((l) => l.length > 0);
}

export function createHidHide(d: HidHideDeps) {
  const exec = d.exec ?? defaultExec;
  const exists = d.exists ?? existsSync;
  const cliPath = hidHideCliPath(d.programFiles);

  const findCli = (): string | null => (exists(cliPath) ? cliPath : null);

  async function run(args: string[]): Promise<string> {
    const cli = findCli();
    if (!cli) throw new HidHideError('E_HIDHIDE_NOT_INSTALLED', 'HidHideCLI.exe was not found');
    try {
      return (await exec(cli, args, { timeoutMs: HIDHIDE_TIMEOUT_MS })).stdout;
    } catch (e) {
      throw new HidHideError('E_HIDHIDE_CLI', `${args[0]}: ${(e as Error).message}`);
    }
  }

  const appRegister = (exePath: string) => run(['--app-reg', exePath]).then(() => undefined);
  const devHide = (instancePath: string) => run(['--dev-hide', instancePath]).then(() => undefined);
  const cloak = (on: boolean) => run([on ? '--cloak-on' : '--cloak-off']).then(() => undefined);
  const appList = async () => parseLines(await run(['--app-list']));
  const devList = async () => parseLines(await run(['--dev-list']));

  /** Instance path of the DualSense's "HID-compliant game controller" collection, from PnP (null when not connected). */
  async function findDualSenseInstance(): Promise<string | null> {
    const cmd =
      "Get-PnpDevice -PresentOnly -Class HIDClass -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match '^HID\\\\VID_054C&PID_0(CE6|DF2)' -and $_.FriendlyName -eq 'HID-compliant game controller' } | Select-Object -ExpandProperty InstanceId";
    let out: string;
    try {
      out = (
        await exec(POWERSHELL_EXE, ['-NoProfile', '-Command', cmd], {
          timeoutMs: HIDHIDE_TIMEOUT_MS,
        })
      ).stdout;
    } catch (e) {
      throw new HidHideError('E_HIDHIDE_NO_DEVICE', `PnP query failed: ${(e as Error).message}`);
    }
    return parseLines(out).find((l) => DUALSENSE_INSTANCE.test(l)) ?? null;
  }

  async function guarded(fn: () => Promise<void>): Promise<HidHideResult> {
    try {
      await fn();
      return { ok: true };
    } catch (e) {
      const code = e instanceof HidHideError ? e.code : 'E_HIDHIDE_CLI';
      d.log.error({ code, msg: (e as Error).message });
      return { ok: false, code, msg: (e as Error).message };
    }
  }

  /** Register this app, hide the DualSense game controller, cloak on. */
  const enable = (): Promise<HidHideResult> =>
    guarded(async () => {
      if (!findCli()) throw new HidHideError('E_HIDHIDE_NOT_INSTALLED', 'HidHide is not installed');
      await appRegister(d.ownExe);
      const inst = await findDualSenseInstance();
      if (!inst)
        throw new HidHideError(
          'E_HIDHIDE_NO_DEVICE',
          'no connected DualSense HID game controller found',
        );
      if (!(await devList()).some((l) => l.toLowerCase() === inst.toLowerCase()))
        await devHide(inst);
      await cloak(true);
      d.log.info({ code: 'HIDHIDE_ENABLED', instance: inst });
    });

  /** Cloak off; the registrations stay. Without HidHide there is nothing to undo. */
  const disable = (): Promise<HidHideResult> =>
    findCli() ? guarded(() => cloak(false)) : Promise.resolve({ ok: true });

  return {
    findCli,
    appRegister,
    devHide,
    cloak,
    appList,
    devList,
    findDualSenseInstance,
    enable,
    disable,
  };
}
export type HidHide = ReturnType<typeof createHidHide>;
