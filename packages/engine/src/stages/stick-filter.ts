import type { StickConfig } from '@dualforge/shared';

export interface FilterState { x: number; y: number; init: boolean }
export const createFilterState = (): FilterState => ({ x: 0, y: 0, init: false });

export const MIN_DT_MS = 0.01;
const MAX_TAU_MS = 60;

function curveStrength(curve: readonly [number, number][], speed: number): number {
  const pts = [...curve].sort((a, b) => a[0] - b[0]);
  let [px, py] = pts[0] ?? [0, 0];
  if (speed <= px) return py;
  for (const [x, y] of pts) {
    if (speed <= x) return x === px ? y : py + ((speed - px) / (x - px)) * (y - py);
    px = x; py = y;
  }
  return py;
}

export function applyStickFilter(
  x: number, y: number, cfg: StickConfig['filter'], s: FilterState, dtMs: number,
): { x: number; y: number } {
  if (!cfg.enabled || !s.init) { s.x = x; s.y = y; s.init = true; return { x, y }; }
  const dt = Math.max(MIN_DT_MS, dtMs);
  let strength = cfg.strength;
  if (cfg.mode === 'advanced') {
    // speedNorm 1.0 = full deflection per 100 ms
    const speedNorm = Math.min(1, (Math.hypot(x - s.x, y - s.y) / dt) * 100);
    strength = curveStrength(cfg.curve, speedNorm);
  }
  if (strength <= 0) { s.x = x; s.y = y; return { x, y }; }
  const tau = (strength / 100) * MAX_TAU_MS;
  const alpha = 1 - Math.exp(-dt / tau);
  s.x += alpha * (x - s.x);
  s.y += alpha * (y - s.y);
  return { x: s.x, y: s.y };
}
