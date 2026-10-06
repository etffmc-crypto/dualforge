import { execFile } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PROFILE_IDS } from '@dualforge/shared';
import type { AppUpdateStatus, HealthInput } from './checks.js';

export const ADAPTER_TIMEOUT_MS = 5000;
export const FOREIGN_MAX_AGE_MS = 60_000;
export const VIGEM_BUS_NAME = 'Nefarius Virtual Gamepad Emulation Bus';
export const DUALSENSE_VID = /VID_054C/i;

export class HealthAdapterError extends Error {
  constructor(
    readonly code: string,
    msg: string,
  ) {
    super(msg);
    this.name = 'HealthAdapterError';
  }
}

export interface ExecResult {
  stdout: string;
}
export type Exec = (
  file: string,
  args: string[],
  opts: { timeoutMs: number },
) => Promise<ExecResult>;
export type ErrorSink = (code: string, msg: string) => void;

const SYS32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
export const SC_EXE = join(SYS32, 'sc.exe');
export const POWERSHELL_EXE = join(SYS32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');

/** Present in the data dir while a quit could not un-cloak HidHide (no admin rights); see E_HIDHIDE_CLOAK_STUCK. */
export const HIDHIDE_STUCK_MARKER = 'hidhide-cloak-stuck';

/** execFile with a hard timeout (E_HEALTH_TIMEOUT). Other failures keep their error (and `stdout`, `stderr`) for the caller to interpret. */
export const defaultExec: Exec = (file, args, { timeoutMs }) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (!err) {
          resolve({ stdout });
          return;
        }
        if ((err as { code?: unknown }).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
          reject(
            new HealthAdapterError('E_HEALTH_OUTPUT_TOO_LARGE', `${file} produced too much output`),
          );
        else if ((err as { killed?: boolean }).killed)
          reject(
            new HealthAdapterError('E_HEALTH_TIMEOUT', `${file} timed out after ${timeoutMs} ms`),
          );
        else reject(Object.assign(err, { stdout, stderr }));
      },
    );
  });

export function parseScState(stdout: string): 'running' | 'stopped' | 'unknown' {
  const m = /STATE\s*:\s*\d+\s+(\w+)/i.exec(stdout);
  if (!m) return 'unknown';
  const s = m[1]!.toUpperCase();
  if (s === 'RUNNING') return 'running';
  if (s === 'STOPPED') return 'stopped';
  return 'unknown'; // START_PENDING, STOP_PENDING, ...
}

/** `sc query ViGEmBus`; exit code 1060 means "service does not exist". */
export async function queryVigemService(
  exec: Exec,
  onError: ErrorSink,
): Promise<HealthInput['vigem']['serviceState']> {
  try {
    return parseScState(
      (await exec(SC_EXE, ['query', 'ViGEmBus'], { timeoutMs: ADAPTER_TIMEOUT_MS })).stdout,
    );
  } catch (e) {
    const err = e as { code?: unknown; stdout?: string; message: string };
    if (err.code === 1060 || /\b1060\b/.test(err.stdout ?? '')) return 'missing';
    onError(err instanceof HealthAdapterError ? err.code : 'E_HEALTH_SC', err.message);
    return 'unknown';
  }
}

/** PnP bus device via PowerShell Get-PnpDevice (status OK = present and started). */
export async function queryVigemBus(exec: Exec, onError: ErrorSink): Promise<boolean> {
  const cmd = `Get-PnpDevice -FriendlyName '${VIGEM_BUS_NAME}' -ErrorAction SilentlyContinue | Where-Object Status -eq 'OK' | Select-Object -First 1 -ExpandProperty Status`;
  try {
    return (
      (
        await exec(POWERSHELL_EXE, ['-NoProfile', '-Command', cmd], {
          timeoutMs: ADAPTER_TIMEOUT_MS,
        })
      ).stdout.trim() === 'OK'
    );
  } catch (e) {
    onError(e instanceof HealthAdapterError ? e.code : 'E_HEALTH_PNP', (e as Error).message);
    return false;
  }
}

export function hidHideCliPath(
  programFiles = process.env.ProgramFiles ?? 'C:\\Program Files',
): string {
  return join(programFiles, 'Nefarius Software Solutions', 'HidHide', 'x64', 'HidHideCLI.exe');
}

/** HidHideCLI answers instantly when healthy; a hang is the failure being detected, so probes are short. */
export const HIDHIDE_PROBE_TIMEOUT_MS = 2000;
/** After a hang / access-denied the CLI is not probed again for this long (Retry now clears it). */
export const HIDHIDE_BACKOFF_MS = 30 * 60_000;

export type HidHideCliState = 'hang' | 'needs-admin';
/** Remembers an unresponsive CLI across health runs so it is neither re-probed nor re-logged every 5 minutes. */
export interface HidHideMemo {
  state: HidHideCliState | null;
  /** Probing is skipped until this time (ms). */
  until: number;
  /** The state already written to the log (cleared when the CLI answers again). */
  logged: HidHideCliState | null;
}
export function createHidHideMemo(): HidHideMemo {
  return { state: null, until: 0, logged: null };
}

/** Forget an unresponsive CLI so the next health run probes it again (the "Retry now" repair). */
export function resetHidHideMemo(memo: HidHideMemo): void {
  memo.state = null;
  memo.until = 0;
}

export interface HidHideDeps {
  exec: Exec;
  cliPath: string;
  exists: (p: string) => boolean;
  ownExe: string;
  onError: ErrorSink;
  memo?: HidHideMemo;
  now?: () => number;
}

const isTimeout = (e: unknown) => e instanceof HealthAdapterError && e.code === 'E_HEALTH_TIMEOUT';
const isDenied = (e: unknown) => {
  const x = e as { code?: unknown; stderr?: unknown; message?: unknown } | null;
  if (!x) return false;
  // 5 = ERROR_ACCESS_DENIED; 740 / EACCES = ERROR_ELEVATION_REQUIRED (a requireAdministrator manifest fails at spawn)
  if (x.code === 5 || x.code === 740 || x.code === 'EACCES') return true;
  const text = `${typeof x.stderr === 'string' ? x.stderr : ''}\n${typeof x.message === 'string' ? x.message : ''}`;
  return /access is denied|requires elevation|elevation required/i.test(text);
};

/**
 * Missing CLI means "not installed" (no error). CLI failures degrade to "not whitelisted / not hidden" plus a coded error.
 * A CLI that hangs or is refused (needs administrator) is probed once (`--version`, 2 s), remembered for 30 min and
 * reported as `cliUnresponsive`; the timeout is logged once per state change, not every run.
 */
export async function queryHidHide(d: HidHideDeps): Promise<HealthInput['hidhide']> {
  if (!d.exists(d.cliPath))
    return { installed: false, cliPath: null, whitelisted: false, deviceHidden: false };
  const memo = d.memo ?? createHidHideMemo();
  const now = (d.now ?? Date.now)();
  const unresponsive = (state: HidHideCliState): HealthInput['hidhide'] => ({
    installed: true,
    cliPath: d.cliPath,
    whitelisted: null,
    deviceHidden: false,
    cliUnresponsive: state,
  });
  const enter = (state: HidHideCliState, msg: string): HealthInput['hidhide'] => {
    memo.state = state;
    memo.until = now + HIDHIDE_BACKOFF_MS;
    if (memo.logged !== state) {
      memo.logged = state;
      d.onError(state === 'hang' ? 'E_HEALTH_TIMEOUT' : 'E_HEALTH_HIDHIDE', msg);
    }
    return unresponsive(state);
  };
  if (memo.state && now < memo.until) return unresponsive(memo.state);
  memo.state = null;
  try {
    await d.exec(d.cliPath, ['--version'], { timeoutMs: HIDHIDE_PROBE_TIMEOUT_MS });
  } catch (e) {
    if (isTimeout(e)) return enter('hang', (e as Error).message);
    if (isDenied(e))
      return enter('needs-admin', `--version: ${(e as Error).message} (needs administrator)`);
    // any other failure (e.g. no --version switch): carry on with the list calls
  }
  let hung: string | null = null;
  let denied: string | null = null;
  const list = async (flag: string): Promise<string | null> => {
    if (hung || denied) return null;
    try {
      return (await d.exec(d.cliPath, [flag], { timeoutMs: HIDHIDE_PROBE_TIMEOUT_MS })).stdout;
    } catch (e) {
      if (isTimeout(e)) {
        hung = (e as Error).message;
        return null;
      }
      if (isDenied(e)) {
        denied = `${flag}: ${(e as Error).message} (needs administrator)`;
        return null;
      }
      d.onError(
        e instanceof HealthAdapterError ? e.code : 'E_HEALTH_HIDHIDE',
        `${flag}: ${(e as Error).message}`,
      );
      return null;
    }
  };
  const [apps, devs] = [await list('--app-list'), await list('--dev-list')];
  if (hung) return enter('hang', hung);
  if (denied) return enter('needs-admin', denied);
  memo.logged = null;
  const norm = (p: string) =>
    p
      .trim()
      .replace(/^["']+|["']+$/g, '')
      .replace(/\//g, '\\')
      .toLowerCase();
  const own = norm(d.ownExe);
  return {
    installed: true,
    cliPath: d.cliPath,
    whitelisted: apps === null ? null : apps.split(/\r?\n/).some((l) => norm(l) === own),
    deviceHidden: devs !== null && DUALSENSE_VID.test(devs),
  };
}

export interface FsLike {
  exists(p: string): boolean;
  list(dir: string): string[];
  size(p: string): number;
}
export const nodeFs: FsLike = {
  exists: existsSync,
  list: (d) => readdirSync(d),
  size: (p) => statSync(p).size,
};

/** ok = a live file; quarantined = no live file but a moved-aside `<slot>.<ts>.json` in profiles/corrupt; default = nothing yet. */
export function profileStatuses(dataDir: string, fs: FsLike = nodeFs): HealthInput['profiles'] {
  const pdir = join(dataDir, 'profiles');
  let corrupt: string[] = [];
  try {
    corrupt = fs.list(join(pdir, 'corrupt'));
  } catch {
    /* no corrupt folder */
  }
  return PROFILE_IDS.map((slot) => {
    if (fs.exists(join(pdir, `${slot}.json`))) return { slot, status: 'ok' as const };
    return {
      slot,
      status: corrupt.some((f) => f.startsWith(`${slot}.`) && f.endsWith('.json'))
        ? ('quarantined' as const)
        : ('default' as const),
    };
  });
}

export function diskUsage(logDir: string, fs: FsLike = nodeFs): HealthInput['disk'] {
  let bytes = 0,
    files = 0;
  try {
    for (const f of fs.list(logDir)) {
      if (!/^app.*\.log$/.test(f)) continue;
      try {
        bytes += fs.size(join(logDir, f));
        files++;
      } catch {
        /* file vanished mid-scan */
      }
    }
  } catch {
    /* no log folder yet */
  }
  return { logBytes: bytes, logFiles: files };
}

export interface EngineView {
  alive: boolean;
  restartsLastHour: number;
  lastErrorCodes: string[];
  snapshot: {
    connected: boolean;
    reportHz: number;
    pipelineP99Ms: number;
    source: 'device' | 'replay';
  } | null;
}
export interface GatherDeps {
  exec: Exec;
  dataDir: string;
  logDir: string;
  ownExe: string;
  appVersion: string;
  engine: () => EngineView;
  /** `lastForeign` is the game watcher's sticky sample of the last non-DualForge foreground. */
  injector: {
    available: boolean;
    lastForeign: () => { name: string; elevated: boolean | null; at: number } | null;
    selfElevated: () => boolean | null;
  };
  now?: () => number;
  onError: ErrorSink;
  /** Last opt-in update check result (null when updates are off or no check has run). */
  updateAvailable?: () => boolean | null;
  /** Wording state for the Health `app` card; omitted in tests that only care about updateAvailable. */
  updateStatus?: () => AppUpdateStatus;
  cliPath?: string;
  exists?: (p: string) => boolean;
  fs?: FsLike;
  /** Shared across runs so an unresponsive HidHideCLI is remembered. */
  hidhideMemo?: HidHideMemo;
}
/** Everything except `device.highestSeenHz`, which the service tracks across runs. */
export type GatheredInput = Omit<HealthInput, 'device'> & {
  device: Omit<HealthInput['device'], 'highestSeenHz'>;
};

/** Gathers every input in parallel; no adapter throws (failures are reported through `onError`). */
export async function gatherInput(d: GatherDeps): Promise<GatheredInput> {
  const [serviceState, busDevicePresent, hidhide] = await Promise.all([
    queryVigemService(d.exec, d.onError),
    queryVigemBus(d.exec, d.onError),
    queryHidHide({
      exec: d.exec,
      cliPath: d.cliPath ?? hidHideCliPath(),
      exists: d.exists ?? existsSync,
      ownExe: d.ownExe,
      onError: d.onError,
      ...(d.hidhideMemo ? { memo: d.hidhideMemo } : {}),
      ...(d.now ? { now: d.now } : {}),
    }),
  ]);
  const e = d.engine();
  const s = e.snapshot;
  let foregroundElevated: boolean | null = null;
  let ownElevated: boolean | null = null;
  let foregroundSeen: { name: string; ageS: number } | null = null;
  try {
    ownElevated = d.injector.selfElevated();
    const f = d.injector.lastForeign();
    const ageMs = f ? (d.now ?? Date.now)() - f.at : 0;
    if (f && ageMs <= FOREIGN_MAX_AGE_MS) {
      foregroundElevated = f.elevated;
      foregroundSeen = { name: f.name, ageS: Math.round(ageMs / 1000) };
    } // older samples are ignored
  } catch (err) {
    d.onError('E_HEALTH_ELEVATION', (err as Error).message);
  }
  return {
    vigem: { serviceState, busDevicePresent },
    hidhide: {
      ...hidhide,
      cloakStuck:
        hidhide.installed && (d.fs ?? nodeFs).exists(join(d.dataDir, HIDHIDE_STUCK_MARKER)),
    },
    device: {
      present: !!s && s.connected && s.source === 'device',
      reportHz: s?.reportHz ?? 0,
      source: s?.source ?? 'device',
    },
    engine: {
      alive: e.alive,
      restartsLastHour: e.restartsLastHour,
      p99Ms: s?.pipelineP99Ms ?? 0,
      lastErrorCodes: e.lastErrorCodes,
    },
    profiles: profileStatuses(d.dataDir, d.fs),
    disk: diskUsage(d.logDir, d.fs),
    app: {
      version: d.appVersion,
      updateAvailable: d.updateAvailable?.() ?? null,
      ...(d.updateStatus ? { update: d.updateStatus() } : {}),
    },
    inject: { available: d.injector.available, foregroundElevated, ownElevated, foregroundSeen },
  };
}
