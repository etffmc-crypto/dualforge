import type { StickConfig } from '@dualforge/shared';

export interface FilterState { x: number; y: number; init: boolean }
export const createFilterState = (): FilterState => ({ x: 0, y: 0, init: false });

const MAX_TAU_MS = 60;

export function applyStickFilter(
  x: number, y: number, cfg: StickConfig['filter'], s: FilterState, dtMs: number,
): { x: number; y: number } {
  if (!cfg.enabled || cfg.strength <= 0) { s.x = x; s.y = y; s.init = true; return { x, y }; }
  if (!s.init) { s.x = x; s.y = y; s.init = true; return { x, y }; }
  const tau = (cfg.strength / 100) * MAX_TAU_MS;
  const alpha = 1 - Math.exp(-Math.max(0.01, dtMs) / tau);
  s.x += alpha * (x - s.x);
  s.y += alpha * (y - s.y);
  return { x: s.x, y: s.y };
}
