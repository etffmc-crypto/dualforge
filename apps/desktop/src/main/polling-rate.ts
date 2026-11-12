import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PollingSetSchema,
  type PollingRateHz,
  type PollingRateResult,
  type PollingRateState,
} from '@dualforge/shared';
import { defaultExec, POWERSHELL_EXE, type Exec } from './health/adapters.js';

/**
 * The DualSense USB polling rate, for pads that carry SweetLow's `hidusbf` lower filter (the "8 kHz" mod). The
 * filter reads the rate from the pad's driver key as `bInterval`; on a USB High Speed pad 1 = 8000 Hz, 2 = 4000,
 * 3 = 2000, 4 = 1000 (each step halves it). DualForge never installs or removes the filter: it only changes that
 * value and restarts the USB device so the filter re-reads it, both of which need administrator rights (one UAC
 * prompt, like the HidHide setup). A stock DualSense has no filter and is a Full Speed device capped at 1 kHz, so
 * the option is unavailable there.
 */
export const HIDUSBF_FILTER = 'hidusbf';
export const POLLING_QUERY_TIMEOUT_MS = 5000;
/** The elevated script waits for the UAC answer, then the device restart (a few seconds). */
export const POLLING_ELEVATION_TIMEOUT_MS = 120_000;
export const POLLING_SCRIPT = 'polling-rate.cmd';
/** The pad reconnects within a few seconds of the restart; the state is re-read after this. */
export const POLLING_SETTLE_MS = 4000;
/** A Full Speed pad never reports above 1 kHz; above this the pad is High Speed and the Hz labels are right. */
export const HIGH_SPEED_MIN_HZ = 1500;
/** USB composite instance of a DualSense (0CE6) or DualSense Edge (0DF2): `USB\VID_054C&PID_0CE6\<serial>` (no &MI_). */
export const DUALSENSE_USB_INSTANCE = /^USB\\VID_054C&PID_0(?:CE6|DF2)\\[A-Za-z0-9&]+$/i;
const CLASS_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\';
/** A driver key as PnP stores it: `{class-guid}\0025`. */
const DRIVER_KEY = /^\{[0-9a-f-]{36}\}\\\d{4}$/i;

export interface PollingRateDeps {
  exec?: Exec;
  /** Where the elevated script is written (the app data dir). */
  dataDir: string;
  writeFile?: (p: string, data: string) => void;
  /** The engine's current report rate. */
  measuredHz: () => number;
  /** A rate was applied: Health forgets its "best rate this session" so the lower rate is not a "dropped" warning. */
  onApplied?: (hz: PollingRateHz) => void;
  sleep?: (ms: number) => Promise<void>;
  log: { info(o: object): void; warn(o: object): void; error(o: object): void };
}

export const hzToBInterval = (hz: PollingRateHz): number => 1 + Math.log2(8000 / hz);
/** null for values the dropdown cannot show (0, 5+, or anything odd a user set by hand). */
export function bIntervalToHz(b: number | null): PollingRateHz | null {
  if (b === null || !Number.isInteger(b) || b < 1 || b > 4) return null;
  return (8000 / 2 ** (b - 1)) as PollingRateHz;
}

/**
 * A pad is High Speed when the engine sees it above 1 kHz, or when its measured rate matches the stored value's
 * High Speed meaning (a Full Speed pad with `bInterval` 2 would run at 500 Hz, not 4000).
 */
export function isHighSpeed(bInterval: number | null, measuredHz: number): boolean {
  if (measuredHz >= HIGH_SPEED_MIN_HZ) return true;
  const expected = bIntervalToHz(bInterval);
  return expected !== null && measuredHz >= expected * 0.8 && measuredHz <= expected * 1.2;
}

export interface PollingQuery {
  instance: string;
  lowerFilters: string[];
  driverKey: string | null;
  bInterval: number | null;
}
/** One PowerShell line `instance|lowerFilters(;-joined)|driverKey|bInterval`; empty output = no pad on USB. */
export function parsePollingQuery(stdout: string): PollingQuery | null {
  for (const line of stdout.split(/\r?\n/)) {
    const [inst = '', filters = '', driver = '', b = ''] = line.split('|').map((s) => s.trim());
    if (!DUALSENSE_USB_INSTANCE.test(inst)) continue;
    const n = b === '' ? null : Number(b);
    return {
      instance: inst,
      lowerFilters: filters
        .split(';')
        .map((f) => f.trim().toLowerCase())
        .filter(Boolean),
      driverKey: DRIVER_KEY.test(driver) ? driver : null,
      bInterval: n !== null && Number.isFinite(n) ? n : null,
    };
  }
  return null;
}

/** `%` would be expanded by cmd.exe even inside quotes. */
const cmdQuote = (s: string) => `"${s.replace(/%/g, '%%')}"`;

/** The elevated script: store the value, then restart the USB device so the filter re-reads it. */
export function composePollingScript(
  driverKey: string,
  instance: string,
  hz: PollingRateHz,
): string {
  return [
    '@echo off',
    `reg add ${cmdQuote(CLASS_KEY + driverKey)} /v bInterval /t REG_DWORD /d ${hzToBInterval(hz)} /f || exit /b 1`,
    `pnputil /restart-device ${cmdQuote(instance)} || exit /b 1`,
    '',
  ].join('\r\n');
}

class PollingRateError extends Error {
  constructor(
    readonly code: string,
    msg: string,
  ) {
    super(msg);
  }
}

export function createPollingRate(d: PollingRateDeps) {
  const exec = d.exec ?? defaultExec;
  const writeFile = d.writeFile ?? ((p: string, data: string) => writeFileSync(p, data, 'utf8'));
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let queryFailLogged = false;

  /** PnP + registry, read-only and unelevated (the Enum and Class keys are world-readable). */
  async function query(): Promise<PollingQuery | null> {
    const cmd =
      "$d = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match '^USB\\\\VID_054C&PID_0(CE6|DF2)\\\\' } | Select-Object -First 1; " +
      "if ($d) { $p = Get-ItemProperty ('HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\' + $d.InstanceId) -ErrorAction SilentlyContinue; $drv = [string]$p.Driver; $b = ''; " +
      "if ($drv) { $v = Get-ItemProperty ('HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\' + $drv) -Name bInterval -ErrorAction SilentlyContinue; if ($v) { $b = [string]$v.bInterval } }; " +
      "$d.InstanceId + '|' + ($p.LowerFilters -join ';') + '|' + $drv + '|' + $b }";
    const out = (
      await exec(POWERSHELL_EXE, ['-NoProfile', '-Command', cmd], {
        timeoutMs: POLLING_QUERY_TIMEOUT_MS,
      })
    ).stdout;
    return parsePollingQuery(out);
  }

  const toState = (q: PollingQuery | null): PollingRateState => {
    const measuredHz = d.measuredHz();
    if (!q) return { available: false, reason: 'no-device', rateHz: null, measuredHz };
    const rateHz = bIntervalToHz(q.bInterval);
    if (!q.lowerFilters.includes(HIDUSBF_FILTER) || !q.driverKey)
      return { available: false, reason: 'no-filter', rateHz, measuredHz };
    if (!isHighSpeed(q.bInterval, measuredHz))
      return { available: false, reason: 'not-high-speed', rateHz, measuredHz };
    return { available: true, rateHz, measuredHz };
  };

  async function get(): Promise<PollingRateState> {
    try {
      const s = toState(await query());
      queryFailLogged = false;
      return s;
    } catch (e) {
      if (!queryFailLogged) d.log.warn({ code: 'E_POLLING_QUERY', msg: (e as Error).message });
      queryFailLogged = true;
      return { available: false, reason: 'query-failed', rateHz: null, measuredHz: d.measuredHz() };
    }
  }

  /** Writes the script to the data dir and runs it with a UAC prompt; any failure means it did not happen. */
  async function runElevated(content: string): Promise<void> {
    const script = join(d.dataDir, POLLING_SCRIPT);
    try {
      writeFile(script, content);
      const ps = `$p = Start-Process -FilePath '${script.replace(/'/g, "''")}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode`;
      await exec(POWERSHELL_EXE, ['-NoProfile', '-NonInteractive', '-Command', ps], {
        timeoutMs: POLLING_ELEVATION_TIMEOUT_MS,
      });
    } catch (e) {
      throw new PollingRateError(
        'E_POLLING_ELEVATION_DECLINED',
        `elevated polling-rate change did not complete: ${(e as Error).message}`,
      );
    }
  }

  /** One change at a time; a second click while the pad restarts is refused rather than queued. */
  let busy = false;

  async function set(hz: PollingRateHz): Promise<PollingRateResult> {
    if (busy)
      return {
        ok: false,
        code: 'E_POLLING_BUSY',
        msg: 'a polling-rate change is still in progress',
        state: await get(),
      };
    busy = true;
    try {
      let q: PollingQuery | null;
      try {
        q = await query();
      } catch (e) {
        throw new PollingRateError('E_POLLING_QUERY', `PnP query failed: ${(e as Error).message}`);
      }
      const before = toState(q);
      if (!q || !before.available || !q.driverKey)
        throw new PollingRateError(
          'E_POLLING_UNAVAILABLE',
          `the polling rate cannot be changed on this pad (${before.reason ?? 'unknown'})`,
        );
      if (before.rateHz === hz) return { ok: true, state: before };
      await runElevated(composePollingScript(q.driverKey, q.instance, hz));
      await sleep(POLLING_SETTLE_MS);
      const after = await get();
      if (after.rateHz !== hz)
        throw new PollingRateError(
          'E_POLLING_APPLY',
          `the stored rate is ${after.rateHz ?? 'unset'} Hz after the change, not ${hz}`,
        );
      d.onApplied?.(hz);
      d.log.info({ code: 'POLLING_RATE_SET', hz, from: before.rateHz, instance: q.instance });
      return { ok: true, state: after };
    } catch (e) {
      const code = e instanceof PollingRateError ? e.code : 'E_POLLING_APPLY';
      d.log.error({ code, msg: (e as Error).message });
      return { ok: false, code, msg: (e as Error).message, state: await get() };
    } finally {
      busy = false;
    }
  }

  return { get, set };
}
export type PollingRate = ReturnType<typeof createPollingRate>;

type Handler = (event: unknown, ...args: unknown[]) => unknown;

/** `polling:get` takes no payload; `polling:set` is zod-validated ({ hz }) before anything runs. */
export function registerPollingIpc(d: {
  ipc: { handle(channel: string, fn: Handler): void };
  polling: Pick<PollingRate, 'get' | 'set'>;
  log: { error(o: object): void };
}): void {
  d.ipc.handle('polling:get', (): Promise<PollingRateState> => d.polling.get());
  d.ipc.handle('polling:set', (_e, raw): Promise<PollingRateResult> => {
    const parsed = PollingSetSchema.safeParse(raw);
    if (!parsed.success) {
      d.log.error({ code: 'E_POLLING_REQUEST', msg: 'polling:set rejected' });
      throw new Error('E_POLLING_REQUEST');
    }
    return d.polling.set(parsed.data.hz);
  });
}
