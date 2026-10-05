import {
  PROFILE_IDS,
  type EngineEvent,
  type HealthResult,
  type HealthRepairRequest,
  type HealthRepairResult,
  type HealthState,
} from '@dualforge/shared';
import { runChecks } from './checks.js';
import type { EngineView, GatheredInput } from './adapters.js';

export const START_DELAY_MS = 3000;
export const INTERVAL_MS = 5 * 60_000;

export interface HealthRepairs {
  restartEngine(): void;
  resetProfile(id: string): void;
  /** Deletes old log files; resolves to how many were removed. */
  clearLogs(): number | Promise<number>;
  /** Opens the logs folder; resolves to '' on success or an error string (shell.openPath semantics). */
  openLogs(): string | Promise<string>;
  /** Diagnostics bundle (Task 3); leave unset until it exists. */
  exportBundle?(): Promise<HealthRepairResult>;
  /** Consent-gated driver installs and HidHide enabling; unset means unavailable. */
  installViGEm?(): Promise<HealthRepairResult>;
  installHidHide?(): Promise<HealthRepairResult>;
  enableHidHide?(): Promise<HealthRepairResult>;
}
export interface HealthDeps {
  gather: () => Promise<GatheredInput>;
  /** Pushes the new state to the renderer (`health:changed`). */
  emit: (s: HealthState) => void;
  log: { info(o: object): void; warn(o: object): void; error(o: object): void };
  repairs: HealthRepairs;
  now?: () => number;
  startDelayMs?: number;
  intervalMs?: number;
}

const UNAVAILABLE: HealthRepairResult = { ok: false, code: 'E_HEALTH_REPAIR_UNAVAILABLE' };

function sameResults(a: readonly HealthResult[], b: readonly HealthResult[]): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => r.id === b[i]!.id && r.status === b[i]!.status && r.detail === b[i]!.detail)
  );
}

export function createHealthService(d: HealthDeps) {
  const now = d.now ?? Date.now;
  let state: HealthState | null = null;
  let highestSource: 'device' | 'replay' | null = null;
  let highestSeenHz = 0; // best report rate this session, so a pad that drops from 8 kHz is noticed even above 800 Hz
  let inflight: Promise<HealthState> | null = null;
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;

  async function doRun(): Promise<HealthState> {
    try {
      const g = await d.gather();
      if (g.device.source !== highestSource) {
        highestSource = g.device.source;
        highestSeenHz = 0;
      } // a new source starts a new baseline
      if (g.device.source === 'device' && g.device.present)
        highestSeenHz = Math.max(highestSeenHz, g.device.reportHz);
      const results = runChecks({ ...g, device: { ...g.device, highestSeenHz } });
      const changed = !state || !sameResults(state.results, results);
      state = { results, ranAt: now() };
      for (const r of results)
        if (r.status === 'error') d.log.warn({ code: 'HEALTH_RESULT', id: r.id, status: r.status });
      if (changed) d.emit(state);
    } catch (e) {
      d.log.error({ code: 'E_HEALTH_CHECK', msg: (e as Error).message });
      state ??= { results: [], ranAt: now() };
    }
    return state;
  }

  function run(): Promise<HealthState> {
    inflight ??= doRun().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  /** A fresh run that starts after any in-flight one finishes (that one may have gathered before the fix). */
  function rerun(): Promise<HealthState> {
    return inflight ? inflight.then(() => run()) : run();
  }

  async function repair(req: HealthRepairRequest): Promise<HealthRepairResult> {
    try {
      let res: HealthRepairResult;
      switch (req.id) {
        case 'restartEngine':
          d.repairs.restartEngine();
          res = { ok: true };
          break;
        case 'resetProfile': {
          if (!req.arg || !(PROFILE_IDS as readonly string[]).includes(req.arg)) {
            res = {
              ok: false,
              code: 'E_HEALTH_BAD_ARG',
              msg: 'resetProfile needs a profile slot (p1..p4)',
            };
            break;
          }
          d.repairs.resetProfile(req.arg);
          res = { ok: true };
          break;
        }
        case 'clearLogs': {
          const n = await d.repairs.clearLogs();
          d.log.info({ code: 'HEALTH_REPAIR', id: 'clearLogs', deleted: n });
          res = { ok: true };
          break;
        }
        case 'openLogs': {
          const err = await d.repairs.openLogs();
          res = err ? { ok: false, code: 'E_HEALTH_OPEN_LOGS', msg: err } : { ok: true };
          break;
        }
        case 'exportBundle':
          res = d.repairs.exportBundle ? await d.repairs.exportBundle() : UNAVAILABLE;
          break;
        case 'installViGEm':
          res = d.repairs.installViGEm ? await d.repairs.installViGEm() : UNAVAILABLE;
          break;
        case 'installHidHide':
          res = d.repairs.installHidHide ? await d.repairs.installHidHide() : UNAVAILABLE;
          break;
        case 'enableHidHide':
          res = d.repairs.enableHidHide ? await d.repairs.enableHidHide() : UNAVAILABLE;
          break;
      }
      if (!res.ok) d.log.warn({ code: res.code, msg: res.msg, repair: req.id });
      else if (req.id !== 'openLogs' && req.id !== 'exportBundle') void rerun(); // re-check so the page reflects the fix
      return res;
    } catch (e) {
      d.log.error({ code: 'E_HEALTH_REPAIR_FAILED', msg: (e as Error).message, repair: req.id });
      return { ok: false, code: 'E_HEALTH_REPAIR_FAILED', msg: (e as Error).message };
    }
  }

  return {
    /** First run after 3 s (lets the engine connect), then every 5 min. */
    start() {
      this.stop();
      startTimer = setTimeout(() => {
        startTimer = null;
        void run();
      }, d.startDelayMs ?? START_DELAY_MS);
      interval = setInterval(() => void run(), d.intervalMs ?? INTERVAL_MS);
    },
    stop() {
      if (startTimer) {
        clearTimeout(startTimer);
        startTimer = null;
      }
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
    /** Cached result; runs the checks first if none exist yet. */
    get(): Promise<HealthState> {
      return state ? Promise.resolve(state) : run();
    },
    /** Latest cached state without running anything (null before the first run); used by the diagnostics bundle. */
    cached(): HealthState | null {
      return state;
    },
    run,
    repair,
  };
}
export type HealthService = ReturnType<typeof createHealthService>;

/** Keeps the facts the checks need from the engine event stream (latest snapshot, recent error codes). */
export function createEngineFeed(
  stats: () => { alive: boolean; restartsLastHour: number },
  maxCodes = 20,
) {
  let snapshot: EngineView['snapshot'] = null;
  const codes: string[] = [];
  return {
    onEvent(e: EngineEvent): void {
      if (e.type === 'snapshot') {
        const lim = codes.indexOf('E_ENGINE_RESTART_LIMIT');
        if (lim >= 0) codes.splice(lim, 1); // a running engine means the limit was left (manual restart)
        const s = e.snapshot;
        snapshot = {
          connected: s.connected,
          reportHz: s.reportHz,
          pipelineP99Ms: s.pipelineP99Ms,
          source: s.source,
        };
      } else if (e.type === 'status') {
        if (!e.connected && snapshot) snapshot = { ...snapshot, connected: false };
      } else if (e.type === 'error') {
        const at = codes.indexOf(e.code);
        if (at >= 0) codes.splice(at, 1);
        codes.push(e.code);
        if (codes.length > maxCodes) codes.shift();
      }
    },
    view(): EngineView {
      return { ...stats(), lastErrorCodes: [...codes], snapshot };
    },
  };
}
