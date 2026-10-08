import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  defaultExec,
  hidHideCliPath,
  isExecDenied,
  isExecTimeout,
  needsElevation,
  HIDHIDE_STUCK_MARKER,
  POWERSHELL_EXE,
  type Exec,
} from './health/adapters.js';

export const HIDHIDE_TIMEOUT_MS = 5000;
/** The elevated setup waits for the user to answer the UAC prompt. */
export const ELEVATION_TIMEOUT_MS = 120_000;
export const SETUP_SCRIPT = 'hidhide-setup.cmd';
/** DualSense (0CE6) and DualSense Edge (0DF2) HID instance paths, e.g. HID\VID_054C&PID_0CE6&MI_03\B&15810585&0&0000. */
export const DUALSENSE_INSTANCE = /^HID\\VID_054C&PID_0(?:CE6|DF2)[A-Za-z0-9_&\\]*$/i;
/** Compatible ID of a HID "game controller" collection (usage page 1, usage 5); unlike FriendlyName it is not localized. */
export const GAME_CONTROLLER_COMPAT_ID = 'HID_DEVICE_UP:0001_U:0005';

export interface HidHideResult {
  ok: boolean;
  code?: string;
  msg?: string;
  /** Startup only: the pad is absent and was never hidden, so nothing was done (retried when it shows up). */
  skipped?: boolean;
}
export interface HidHideDeps {
  exec?: Exec;
  exists?: (p: string) => boolean;
  /** The exe to whitelist: the app itself (the Electron exe in dev); the engine runs as a child of it. */
  ownExe: string;
  programFiles?: string;
  /** Where the elevated setup script is written (the app data dir). */
  dataDir?: string;
  writeFile?: (p: string, data: string) => void;
  /** true: a quit cloak-off was refused (the pad stays hidden); false: a later cloak-off worked. Drives a persistent Health warning. */
  onCloakStuck?: (stuck: boolean) => void;
  /** Whether this session cloaked (the queue knows); the stuck marker is written only then. Default: assume yes. */
  cloakedThisSession?: () => boolean;
  /** A previous session's quit could not cloak off (the stuck marker exists). Default: the marker file in dataDir. */
  stillCloaked?: () => boolean;
  log: { info(o: object): void; warn(o: object): void; error(o: object): void };
}

class HidHideError extends Error {
  constructor(
    readonly code: string,
    msg: string,
    /** The unelevated CLI was refused or hung (see needsElevation): the elevated script is the way forward. */
    readonly needsElevation = false,
    /** It hung (timed out) rather than refusing. */
    readonly hung = false,
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

/** A failed exec that Windows refused for lack of rights (the classification Health uses too). */
export const isAccessDenied = isExecDenied;

/**
 * PnP output lines `InstanceId|CompatibleIDs (;-joined)|FriendlyName`: the DualSense collection whose compatible IDs
 * mark it as a game controller. FriendlyName is ignored (it is localized).
 */
export function parseDualSenseInstance(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    const [id = '', compat = ''] = line.split('|');
    const inst = id.trim();
    if (!DUALSENSE_INSTANCE.test(inst)) continue;
    if (compat.split(';').some((c) => c.trim().toUpperCase() === GAME_CONTROLLER_COMPAT_ID))
      return inst;
  }
  return null;
}

/** `%` would be expanded by cmd.exe even inside quotes. */
const cmdQuote = (s: string) => `"${s.replace(/%/g, '%%')}"`;

/** The one-time elevated setup: the same three CLI calls enable makes, each aborting the script on failure. */
export function composeElevatedSetup(cli: string, exe: string, instance: string): string {
  return [
    '@echo off',
    `${cmdQuote(cli)} --app-reg ${cmdQuote(exe)} || exit /b 1`,
    `${cmdQuote(cli)} --dev-hide ${cmdQuote(instance)} || exit /b 1`,
    `${cmdQuote(cli)} --cloak-on || exit /b 1`,
    '',
  ].join('\r\n');
}

/** The elevated cloak-off used when an unelevated disable is refused. */
export function composeElevatedCloakOff(cli: string): string {
  return ['@echo off', `${cmdQuote(cli)} --cloak-off || exit /b 1`, ''].join('\r\n');
}

export function createHidHide(d: HidHideDeps) {
  const exec = d.exec ?? defaultExec;
  const exists = d.exists ?? existsSync;
  const writeFile = d.writeFile ?? ((p: string, data: string) => writeFileSync(p, data, 'utf8'));
  const cliPath = hidHideCliPath(d.programFiles);
  const stillCloaked =
    d.stillCloaked ?? (() => (d.dataDir ? exists(join(d.dataDir, HIDHIDE_STUCK_MARKER)) : false));
  /** Hangs already logged this process (by args), so a hung CLI is reported once, not on every attempt. */
  const hangLogged = new Set<string>();
  let stillCloakedLogged = false;

  const findCli = (): string | null => (exists(cliPath) ? cliPath : null);

  async function run(args: string[]): Promise<string> {
    const cli = findCli();
    if (!cli) throw new HidHideError('E_HIDHIDE_NOT_INSTALLED', 'HidHideCLI.exe was not found');
    try {
      return (await exec(cli, args, { timeoutMs: HIDHIDE_TIMEOUT_MS })).stdout;
    } catch (e) {
      // unelevated, HidHideCLI may never answer instead of refusing: treat the hang like access denied
      const hung = isExecTimeout(e);
      const key = args.join('\0');
      if (hung && !hangLogged.has(key)) {
        hangLogged.add(key);
        d.log.warn({ code: 'HIDHIDE_CLI_HANG', args, msg: (e as Error).message });
      }
      throw new HidHideError(
        'E_HIDHIDE_CLI',
        `${args[0]}: ${(e as Error).message}`,
        needsElevation(e),
        hung,
      );
    }
  }

  const appRegister = (exePath: string) => run(['--app-reg', exePath]).then(() => undefined);
  const devHide = (instancePath: string) => run(['--dev-hide', instancePath]).then(() => undefined);
  const cloak = (on: boolean) => run([on ? '--cloak-on' : '--cloak-off']).then(() => undefined);
  const appList = async () => parseLines(await run(['--app-list']));
  const devList = async () => parseLines(await run(['--dev-list']));

  /** Instance path of the DualSense's game-controller collection, from PnP (null when not connected). */
  async function findDualSenseInstance(): Promise<string | null> {
    const cmd =
      "Get-PnpDevice -PresentOnly -Class HIDClass -ErrorAction SilentlyContinue | Where-Object { ($_.InstanceId -like 'HID\\VID_054C&PID_0CE6*' -or $_.InstanceId -like 'HID\\VID_054C&PID_0DF2*') -and ($_.CompatibleID -contains '" +
      GAME_CONTROLLER_COMPAT_ID +
      "') } | ForEach-Object { $_.InstanceId + '|' + ($_.CompatibleID -join ';') + '|' + $_.FriendlyName }";
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
    return parseDualSenseInstance(out);
  }

  /** Set when the user declined (or the elevated script failed) this session; automatic ops then never prompt again. */
  let declined = false;

  /** Writes `content` to the data dir and runs it elevated (UAC prompt); any failure means it did not happen. */
  async function runElevated(content: string, auto: boolean): Promise<void> {
    if (auto && declined)
      throw new HidHideError(
        'E_HIDHIDE_ELEVATION_DECLINED',
        'administrator rights were declined earlier this session; not prompting again',
      );
    if (!d.dataDir)
      throw new HidHideError('E_HIDHIDE_ELEVATION_DECLINED', 'no data folder for the setup script');
    const script = join(d.dataDir, SETUP_SCRIPT);
    try {
      writeFile(script, content);
      const ps = `$p = Start-Process -FilePath '${script.replace(/'/g, "''")}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode`;
      await exec(POWERSHELL_EXE, ['-NoProfile', '-NonInteractive', '-Command', ps], {
        timeoutMs: ELEVATION_TIMEOUT_MS,
      });
    } catch (e) {
      declined = true;
      throw new HidHideError(
        'E_HIDHIDE_ELEVATION_DECLINED',
        `elevated HidHide call did not complete: ${(e as Error).message}`,
      );
    }
    d.log.info({ code: 'HIDHIDE_ELEVATED_SETUP' });
  }

  async function guarded(fn: () => Promise<HidHideResult | void>): Promise<HidHideResult> {
    try {
      return (await fn()) ?? { ok: true };
    } catch (e) {
      const code = e instanceof HidHideError ? e.code : 'E_HIDHIDE_CLI';
      d.log.error({ code, msg: (e as Error).message });
      return { ok: false, code, msg: (e as Error).message };
    }
  }

  /**
   * Register this app, hide the DualSense game controller, cloak on. Without admin rights the CLI is refused or hangs
   * until the timeout: then the same steps run once from an elevated script (UAC). At startup an absent pad is not an error: a pad hidden earlier
   * is cloaked again; one never hidden is skipped until it shows up.
   */
  const enableFlow = (startup: boolean, auto: boolean): Promise<HidHideResult> =>
    guarded(async () => {
      const cli = findCli();
      if (!cli) throw new HidHideError('E_HIDHIDE_NOT_INSTALLED', 'HidHide is not installed');
      if (!auto) declined = false; // the user asked again: a new UAC prompt is fine
      const locate = async (hidden?: string[]): Promise<string | null> => {
        const present = await findDualSenseInstance();
        if (present) return present;
        if (!startup)
          throw new HidHideError(
            'E_HIDHIDE_NO_DEVICE',
            'no connected DualSense HID game controller found',
          );
        return (hidden ?? (await devList())).find((l) => DUALSENSE_INSTANCE.test(l)) ?? null;
      };
      const skip = (): HidHideResult => {
        d.log.info({
          code: 'HIDHIDE_WAIT_DEVICE',
          msg: 'no DualSense connected or hidden yet; HidHide is applied when it is plugged in',
        });
        return { ok: true, skipped: true };
      };
      let inst: string | null | undefined;
      try {
        await appRegister(d.ownExe);
        const hidden = await devList();
        inst = await locate(hidden);
        if (!inst) return skip();
        const target = inst.toLowerCase();
        if (!hidden.some((l) => l.toLowerCase() === target)) await devHide(inst);
        await cloak(true);
      } catch (e) {
        if (!(e instanceof HidHideError && e.needsElevation)) throw e;
        if (!e.hung) d.log.warn({ code: 'HIDHIDE_ACCESS_DENIED', msg: e.message });
        // startup on a hung CLI after a quit that could not cloak off: the cloak (and HidHide's registrations) are still
        // in place, so no UAC prompt at every launch; Health keeps its "state unknown / Retry now" card
        if (startup && e.hung && stillCloaked()) {
          if (!stillCloakedLogged)
            d.log.info({
              code: 'HIDHIDE_STILL_CLOAKED',
              msg: 'HidHideCLI hangs and the last quit left the cloak on; not running the elevated setup',
            });
          stillCloakedLogged = true;
          return { ok: true, skipped: false };
        }
        // a hung CLI would hang again on --dev-list: at startup an absent pad then waits until it is plugged in
        inst ??= await locate(e.hung ? [] : undefined);
        if (!inst) return skip();
        await runElevated(composeElevatedSetup(cli, d.ownExe, inst), auto);
      }
      d.log.info({ code: 'HIDHIDE_ENABLED', instance: inst });
    });

  /** `auto`: started by DualForge itself (converge), not a user click; never re-prompts after a decline. */
  const enable = (opts: { auto?: boolean } = {}) => enableFlow(false, !!opts.auto);
  const startup = () => enableFlow(true, true);

  /** Cloak off; the registrations stay. Refused (or hung) for lack of rights → one elevated --cloak-off. Not installed → nothing to undo. */
  const disable = (opts: { auto?: boolean } = {}): Promise<HidHideResult> => {
    const cli = findCli();
    return cli
      ? guarded(async () => {
          try {
            await cloak(false);
          } catch (e) {
            if (!(e instanceof HidHideError && e.needsElevation)) throw e;
            if (!e.hung) d.log.warn({ code: 'HIDHIDE_ACCESS_DENIED', msg: e.message });
            await runElevated(composeElevatedCloakOff(cli), !!opts.auto);
          }
          d.onCloakStuck?.(false);
        })
      : Promise.resolve({ ok: true });
  };

  /** Quit/logoff: cloak off without ever prompting. Refused (or hung) for lack of rights → the pad stays hidden (E_HIDHIDE_CLOAK_STUCK). */
  const quitCloakOff = (): Promise<HidHideResult> =>
    findCli()
      ? guarded(async () => {
          try {
            await cloak(false);
          } catch (e) {
            if (e instanceof HidHideError && e.needsElevation) {
              if (d.cloakedThisSession?.() ?? true) d.onCloakStuck?.(true);
              throw new HidHideError('E_HIDHIDE_CLOAK_STUCK', e.message);
            }
            throw e;
          }
          d.onCloakStuck?.(false);
        })
      : Promise.resolve({ ok: true });

  return {
    findCli,
    appRegister,
    devHide,
    cloak,
    appList,
    devList,
    findDualSenseInstance,
    enable,
    startup,
    disable,
    quitCloakOff,
  };
}
export type HidHide = ReturnType<typeof createHidHide>;

export interface HidHideQueueDeps {
  hidhide: Pick<HidHide, 'enable' | 'startup' | 'disable' | 'quitCloakOff'>;
  /** The current `settings.hidHide`, read after each op to converge on it. */
  desired: () => boolean;
  log: { info(o: object): void };
}

/**
 * Serializes every HidHide operation (toggle, startup, Health repair, quit) through one promise chain. After an op
 * that established a cloak state, the current setting is re-applied if it changed meanwhile, so the last word wins.
 */
export function createHidHideQueue(d: HidHideQueueDeps) {
  let tail: Promise<unknown> = Promise.resolve();
  let cloaked = false;

  const enqueue = <T>(op: () => Promise<T>): Promise<T> => {
    const p = tail.then(op, op);
    tail = p.catch(() => undefined);
    return p;
  };
  const note = (on: boolean, r: HidHideResult): boolean | null => {
    if (!r.ok || r.skipped) return null;
    if (on) cloaked = true;
    return on;
  };
  const apply = async (
    on: boolean,
    op: () => Promise<HidHideResult>,
    onOk?: () => void,
  ): Promise<HidHideResult> => {
    const r = await op();
    const established = note(on, r);
    if (established === null) return r;
    onOk?.();
    const want = d.desired();
    if (want !== established) {
      const c = await (want ? d.hidhide.enable({ auto: true }) : d.hidhide.disable({ auto: true }));
      note(want, c);
      d.log.info({ code: 'HIDHIDE_CONVERGE', to: want, ok: c.ok });
    }
    return r;
  };

  return {
    enable: () => enqueue(() => apply(true, d.hidhide.enable)),
    startup: () => enqueue(() => apply(true, d.hidhide.startup)),
    disable: () => enqueue(() => apply(false, d.hidhide.disable)),
    /** Health "enable" repair; `persist` turns the setting on inside the queue so converge keeps it. */
    repair: (persist: () => void) => enqueue(() => apply(true, d.hidhide.enable, persist)),
    /** Quit/logoff cloak-off, needed whenever this session cloaked or the setting is on; null when there is nothing to do. */
    quitCleanup: (settingOn: boolean): Promise<HidHideResult> | null =>
      cloaked || settingOn ? enqueue(() => d.hidhide.quitCloakOff()) : null,
    cloakedThisSession: () => cloaked,
  };
}
export type HidHideQueue = ReturnType<typeof createHidHideQueue>;
