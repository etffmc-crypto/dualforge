import type { Macro, XInputState } from '@dualforge/shared';
import { activate, type MouseButton } from './mapping.js';

export interface RunningMacro {
  id: string;
  step: number;
  phase: 'hold' | 'delay';
  untilMs: number;
}
export interface MacroState {
  running: RunningMacro[];
}
export const createMacroState = (): MacroState => ({ running: [] });

/** Starts a macro at step 0. No-op if it is already running (no re-trigger while held) or unknown. */
export function startMacro(
  s: MacroState,
  id: string,
  nowMs: number,
  macros: Map<string, Macro>,
): void {
  const m = macros.get(id);
  if (!m || s.running.some((r) => r.id === id)) return;
  s.running.push({ id, step: 0, phase: 'hold', untilMs: nowMs + m.steps[0]!.holdMs });
}

export function stopMacro(s: MacroState, id: string): void {
  const i = s.running.findIndex((r) => r.id === id);
  if (i >= 0) s.running.splice(i, 1);
}

/**
 * Called when the profile changes: running macros whose definition disappeared are stopped; ones whose definition changed
 * (structurally) are stopped, or restarted from step 0 if they loop; unchanged ones keep running.
 */
export function reconcileMacros(
  s: MacroState,
  prev: Map<string, Macro>,
  next: Map<string, Macro>,
  nowMs: number,
): void {
  for (let i = s.running.length - 1; i >= 0; i--) {
    const r = s.running[i]!;
    const n = next.get(r.id),
      p = prev.get(r.id);
    if (!n) {
      s.running.splice(i, 1);
      continue;
    }
    if (n === p || (p && JSON.stringify(n) === JSON.stringify(p))) continue;
    if (n.loop) {
      r.step = 0;
      r.phase = 'hold';
      r.untilMs = nowMs + n.steps[0]!.holdMs;
    } else s.running.splice(i, 1);
  }
}

/** A tick later than this after a step's deadline means the loop stalled (sleep, debugger): do not catch up. */
const STALL_RESYNC_MS = 1000;

const cycleMs = (m: Macro): number => {
  let t = 0;
  for (const st of m.steps) t += st.holdMs + st.delayMs;
  return t;
};

/**
 * Advances every running macro to `nowMs` and applies the active step targets (hold phase only) into `out`.
 * A step with holdMs 0 is never observed as active. After a stall longer than STALL_RESYNC_MS the schedule resyncs to `nowMs`
 * instead of replaying every missed step. A looping macro whose cycle is 0 ms restarts 1 ms after `nowMs` (the loop below
 * would otherwise never advance `untilMs` past `nowMs`).
 */
export function tickMacros(
  s: MacroState,
  nowMs: number,
  macros: Map<string, Macro>,
  out: { xinput: XInputState; keysWanted: Set<string>; mouseWanted: Set<MouseButton> },
): void {
  for (let i = s.running.length - 1; i >= 0; i--) {
    const r = s.running[i]!;
    const m = macros.get(r.id);
    let alive = !!m && r.step < m.steps.length; // a stale step index (profile edited mid-run) drops the macro
    if (alive && nowMs - r.untilMs > STALL_RESYNC_MS) r.untilMs = nowMs;
    while (alive && m && nowMs >= r.untilMs) {
      const step = m.steps[r.step]!;
      if (r.phase === 'hold') {
        r.phase = 'delay';
        r.untilMs += step.delayMs;
      } else if (r.step + 1 < m.steps.length) {
        r.step++;
        r.phase = 'hold';
        r.untilMs += m.steps[r.step]!.holdMs;
      } else if (m.loop) {
        r.step = 0;
        r.phase = 'hold';
        r.untilMs = cycleMs(m) === 0 ? nowMs + 1 : r.untilMs + m.steps[0]!.holdMs;
      } else {
        alive = false;
      }
    }
    if (!alive || !m) {
      s.running.splice(i, 1);
      continue;
    }
    if (r.phase === 'hold')
      activate(m.steps[r.step]!.target, out.xinput, out.keysWanted, out.mouseWanted);
  }
}
