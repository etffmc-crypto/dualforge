import type { StickConfig } from '@dualforge/shared';

export interface FilterState {
  x: number;
  y: number;
  init: boolean;
  posX: number;
  posY: number;
  speed: number;
  phase: number;
}
export const createFilterState = (): FilterState => ({
  x: 0,
  y: 0,
  init: false,
  posX: 0,
  posY: 0,
  speed: 0,
  phase: 0,
});

export const MIN_DT_MS = 0.01;
const MAX_TAU_MS = 60;
const SPEED_TAU_MS = 30; // time constant of the speed estimate
const POS_TAU_MS = 10; // speed is measured on a lightly smoothed position so 1 LSB jitter at 1 kHz doesn't read as motion

/** Negative smoothing ("RC filter" jitter): oscillation amplitude at -100, in deflection units. */
export const JITTER_AMP_MAX = 0.08;
/** Normalized speed (1.0 = full deflection per 100 ms) at which the stick counts as fully moving. */
export const JITTER_SPEED_REF = 0.04;
const TWO_PI = 2 * Math.PI;

const clamp1 = (v: number): number => (v > 1 ? 1 : v < -1 ? -1 : v);

function curveStrength(curve: readonly [number, number][], speed: number): number {
  // curve x is non-decreasing (enforced by StickFilterSchema); no per-sample copy/sort
  let [px, py] = curve[0] ?? [0, 0];
  if (speed <= px) return py;
  for (const [x, y] of curve) {
    if (speed <= x) return x === px ? y : py + ((speed - px) / (x - px)) * (y - py);
    px = x;
    py = y;
  }
  return py;
}

export function applyStickFilter(
  x: number,
  y: number,
  cfg: StickConfig['filter'],
  s: FilterState,
  dtMs: number,
): { x: number; y: number } {
  if (!cfg.enabled || !s.init) {
    s.x = x;
    s.y = y;
    s.posX = x;
    s.posY = y;
    s.speed = 0;
    s.phase = 0;
    s.init = true;
    return { x, y };
  }
  const dt = Math.max(MIN_DT_MS, dtMs);
  let strength = cfg.strength;
  if (cfg.mode === 'advanced' || strength < 0) {
    // instSpeed 1.0 = full deflection per 100 ms (velocity of the smoothed position), then a time-constant EMA
    const a = 1 - Math.exp(-dt / POS_TAU_MS);
    const px = s.posX + a * (x - s.posX),
      py = s.posY + a * (y - s.posY);
    const instSpeed = Math.min(1, (Math.hypot(px - s.posX, py - s.posY) / dt) * 100);
    s.posX = px;
    s.posY = py;
    s.speed += (1 - Math.exp(-dt / SPEED_TAU_MS)) * (instSpeed - s.speed);
    if (cfg.mode === 'advanced') strength = curveStrength(cfg.curve, s.speed);
  }
  if (strength < 0) {
    // negative smoothing: a jitterHz sine added while the stick moves. The phase advances by real time so the
    // wobble has the same frequency at any report rate and a 60-250 Hz game actually samples it. Gated by the
    // speed estimate, so a still stick (e.g. resting inside the deadzone) is passed through untouched.
    const env = Math.min(1, s.speed / JITTER_SPEED_REF);
    s.phase += (TWO_PI * cfg.jitterHz * dt) / 1000;
    if (s.phase >= TWO_PI) s.phase %= TWO_PI;
    const d = (Math.min(100, -strength) / 100) * JITTER_AMP_MAX * env * Math.sin(s.phase);
    s.x = x; // positive smoothing (advanced curve) resumes from the raw input
    s.y = y;
    return { x: clamp1(x + d), y: clamp1(y + d) };
  }
  if (strength === 0) {
    s.x = x;
    s.y = y;
    return { x, y };
  }
  const tau = (strength / 100) * MAX_TAU_MS;
  const alpha = 1 - Math.exp(-dt / tau);
  s.x += alpha * (x - s.x);
  s.y += alpha * (y - s.y);
  return { x: s.x, y: s.y };
}
