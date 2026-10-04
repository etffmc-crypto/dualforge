import type { StickConfig } from '@dualforge/shared';

export interface FilterState { x: number; y: number; init: boolean; posX: number; posY: number; speed: number }
export const createFilterState = (): FilterState => ({ x: 0, y: 0, init: false, posX: 0, posY: 0, speed: 0 });

export const MIN_DT_MS = 0.01;
const MAX_TAU_MS = 60;
const SPEED_TAU_MS = 30;   // time constant of the speed estimate
const POS_TAU_MS = 10;     // speed is measured on a lightly smoothed position so 1 LSB jitter at 1 kHz doesn't read as motion

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
  if (!cfg.enabled || !s.init) { s.x = x; s.y = y; s.posX = x; s.posY = y; s.speed = 0; s.init = true; return { x, y }; }
  const dt = Math.max(MIN_DT_MS, dtMs);
  let strength = cfg.strength;
  if (cfg.mode === 'advanced') {
    // instSpeed 1.0 = full deflection per 100 ms (velocity of the smoothed position), then a time-constant EMA
    const a = 1 - Math.exp(-dt / POS_TAU_MS);
    const px = s.posX + a * (x - s.posX), py = s.posY + a * (y - s.posY);
    const instSpeed = Math.min(1, (Math.hypot(px - s.posX, py - s.posY) / dt) * 100);
    s.posX = px; s.posY = py;
    s.speed += (1 - Math.exp(-dt / SPEED_TAU_MS)) * (instSpeed - s.speed);
    strength = curveStrength(cfg.curve, s.speed);
  }
  if (strength <= 0) { s.x = x; s.y = y; return { x, y }; }
  const tau = (strength / 100) * MAX_TAU_MS;
  const alpha = 1 - Math.exp(-dt / tau);
  s.x += alpha * (x - s.x);
  s.y += alpha * (y - s.y);
  return { x: s.x, y: s.y };
}
