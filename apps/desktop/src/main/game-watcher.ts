import { basename } from 'node:path';
import type { Settings } from '@dualforge/shared';

export interface GameWatcherOpts {
  /** Basename of the foreground process (e.g. "cod.exe"), '' when unknown. */
  foreground: () => string;
  settings: () => Settings;
  /** Load `profileId` into the engine WITHOUT making it the user's saved active profile. */
  onSwitch: (profileId: string) => void;
  intervalMs?: number;
  /** False when the native addon is missing: the watcher then does nothing. */
  available?: boolean;
  log?: (code: string, msg: string) => void;
  /** Elevation of the foreground process (sampled on the same poll); null when unknown. */
  foregroundElevated?: () => boolean | null;
  now?: () => number;
  /** Pid of the foreground process (same poll); null when unknown. When absent or null, the exe name is compared with `ignore`. */
  foregroundPid?: () => number | null;
  /** This process's pid (default `process.pid`). */
  ownPid?: number;
  /** Called whenever the sampled "DualForge (any of its windows, native dialogs included) is in front" value changes. */
  onOwnForeground?: (own: boolean) => void;
  /** Executable basenames treated like an unknown foreground (DualForge itself). Default: this process and electron.exe. */
  ignore?: string[];
}

/** 30 polls of 2 s = 60 s without a foreign foreground clears the sticky sample. */
export const FOREIGN_EXPIRY_TICKS = 30;

export interface ForeignForeground {
  name: string;
  elevated: boolean | null;
  at: number;
}

/**
 * Polls the foreground process. A match against `settings.autoSwitch` (case-insensitive exe) switches to that rule's profile once;
 * when no rule matches any more it returns to the user's own active profile (`settings.activeProfile`, which auto-switching never changes).
 */
export function createGameWatcher(o: GameWatcherOpts) {
  const intervalMs = o.intervalMs ?? 2000;
  let timer: ReturnType<typeof setInterval> | null = null;
  const ignore = new Set(
    (o.ignore ?? [basename(process.execPath), 'electron.exe']).map((n) => n.toLowerCase()),
  );
  let lastForeign: ForeignForeground | null = null; // sticky: last foreground that was not DualForge itself
  let idleTicks = 0; // consecutive ticks with no foreign foreground (empty or DualForge itself)
  let current: string | null = null; // profile the watcher last loaded; null while following the manual profile

  function safeSwitch(id: string) {
    try {
      o.onSwitch(id);
    } catch (e) {
      o.log?.('E_AUTOSWITCH', (e as Error).message);
    }
  }

  let ownForeground = false;
  /** Samples the foreground once: true when it is one of DualForge's own windows (pid match, else exe-name match). */
  function sampleOwn(fg: string): void {
    let own: boolean;
    let pid: number | null = null;
    try {
      pid = o.foregroundPid?.() ?? null;
    } catch {
      /* unknown */
    }
    if (pid !== null) own = pid === (o.ownPid ?? process.pid);
    else own = fg !== '' && ignore.has(fg);
    if (own !== ownForeground) {
      ownForeground = own;
      o.onOwnForeground?.(own);
    }
  }

  function tick() {
    const fg = o.foreground().toLowerCase();
    sampleOwn(fg);
    if (fg === '' || ignore.has(fg)) {
      if (++idleTicks >= FOREIGN_EXPIRY_TICKS) lastForeign = null; // ~60 s away: the sample is stale
      return;
    }
    idleTicks = 0; // transient (no window, UAC) or DualForge itself: keep the current profile
    let elevated: boolean | null = null;
    try {
      elevated = o.foregroundElevated?.() ?? null;
    } catch {
      /* unknown */
    }
    lastForeign = { name: fg, elevated, at: (o.now ?? Date.now)() };
    const s = o.settings();
    const rule = s.autoSwitch.find((r) => r.exe.toLowerCase() === fg);
    if (rule) {
      if (current !== rule.profileId) {
        if (current === null && rule.profileId === s.activeProfile) {
          current = rule.profileId;
          return;
        } // already running it
        current = rule.profileId;
        safeSwitch(rule.profileId);
      }
    } else if (current !== null) {
      const back = s.activeProfile;
      const was = current;
      current = null;
      if (back !== was) safeSwitch(back);
    }
  }

  return {
    start() {
      if (o.available === false || timer) return;
      timer = setInterval(tick, intervalMs);
    },
    /** The most recent foreground program other than DualForge (name, elevation, when), or null before any was seen. */
    lastForeignForeground(): ForeignForeground | null {
      return lastForeign;
    },
    /** True when the last sample found DualForge itself in front (its window, or a native dialog it opened). */
    isOwnForeground(): boolean {
      return ownForeground;
    },
    /** Takes a sample now (e.g. when the window loses focus) instead of waiting for the next tick. */
    sampleOwnForeground(): void {
      sampleOwn(o.foreground().toLowerCase());
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
