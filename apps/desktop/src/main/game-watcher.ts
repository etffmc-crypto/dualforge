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
  /** Executable basenames treated like an unknown foreground (DualForge itself). Default: this process and electron.exe. */
  ignore?: string[];
}

/**
 * Polls the foreground process. A match against `settings.autoSwitch` (case-insensitive exe) switches to that rule's profile once;
 * when no rule matches any more it returns to the user's own active profile (`settings.activeProfile`, which auto-switching never changes).
 */
export function createGameWatcher(o: GameWatcherOpts) {
  const intervalMs = o.intervalMs ?? 2000;
  let timer: ReturnType<typeof setInterval> | null = null;
  const ignore = new Set((o.ignore ?? [basename(process.execPath), 'electron.exe']).map((n) => n.toLowerCase()));
  let current: string | null = null;   // profile the watcher last loaded; null while following the manual profile

  function safeSwitch(id: string) {
    try { o.onSwitch(id); } catch (e) { o.log?.('E_AUTOSWITCH', (e as Error).message); }
  }

  function tick() {
    const fg = o.foreground().toLowerCase();
    if (fg === '' || ignore.has(fg)) return;   // transient (no window, UAC) or DualForge itself: keep the current profile
    const s = o.settings();
    const rule = s.autoSwitch.find((r) => r.exe.toLowerCase() === fg);
    if (rule) {
      if (current !== rule.profileId) {
        if (current === null && rule.profileId === s.activeProfile) { current = rule.profileId; return; }   // already running it
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
    start() { if (o.available === false || timer) return; timer = setInterval(tick, intervalMs); },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}
