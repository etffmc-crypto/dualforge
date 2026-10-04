import type { StickConfig } from '@dualforge/shared';

export interface FilterState { x: number; y: number; init: boolean; rawX: number; rawY: number; speed: number }
export const createFilterState = (): FilterState => ({ x: 0, y: 0, init: false, rawX: 0, rawY: 0, speed: 0 });

export const MIN_DT_MS = 0.01;
const MAX_TAU_MS = 60;
const SPEED_TAU_MS = 30;   // time constant of the speed estimate, so 1 ms reports don't alias to quantisation noise

function curveStrength(curve: readonly [number, number][], speed: number): number {
  // curve x is non-decreasing (enforced by StickFilterSchema); no per-sample copy/sort
  let [px, py] = curve[0] ?? [0, 0];
  if (speed <= px) return py;
  for (const [x, y] of curve) {
    if (speed <= x) return x === px ? y : py + ((speed - px) / (x - px)) * (y - py);
    px = x; py = y;
  }
  return py;
}

export function applyStickFilter(
  x: number, y: number, cfg: StickConfig['filter'], s: FilterState, dtMs: number,
): { x: number; y: number } {
  if (!cfg.enabled || !s.init) { s.x = x; s.y = y; s.rawX = x; s.rawY = y; s.speed = 0; s.init = true; return { x, y }; }
  const dt = Math.max(MIN_DT_MS, dtMs);
  let strength = cfg.strength;
  if (cfg.mode === 'advanced') {
    // instSpeed 1.0 = full deflection per 100 ms, smoothed by a time-constant EMA
    const instSpeed = Math.min(1, (Math.hypot(x - s.rawX, y - s.rawY) / dt) * 100);
    s.speed += (1 - Math.exp(-dt / SPEED_TAU_MS)) * (instSpeed - s.speed);
    strength = curveStrength(cfg.curve, s.speed);
  }
  s.rawX = x; s.rawY = y;
  if (strength <= 0) { s.x = x; s.y = y; return { x, y }; }
  const tau = (strength / 100) * MAX_TAU_MS;
  const alpha = 1 - Math.exp(-dt / tau);
  s.x += alpha * (x - s.x);
  s.y += alpha * (y - s.y);
  return { x: s.x, y: s.y };
}
