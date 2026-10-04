import type { StickConfig } from '@dualforge/shared';

export interface Deadzone {
  center: number;
  outer: number;
  anti?: number;
}

export function applyRadialDeadzone(mag: number, dz: Deadzone): number {
  const hi = 1 - dz.outer;
  if (mag <= dz.center) return 0;
  if (mag >= hi) return 1;
  const span = Math.max(1e-6, hi - dz.center);
  const t = (mag - dz.center) / span;
  return t;
}

/** Anti-deadzone: lifts any live magnitude so the smallest nonzero input starts at `anti`. Applied after the curve. */
export function applyAntiDeadzone(x: number, y: number, anti: number): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (anti <= 0 || mag === 0) return { x, y };
  const k = (anti + mag * (1 - anti)) / mag;
  return { x: x * k, y: y * k };
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

export function applyStickShaping(
  x: number,
  y: number,
  cfg: StickConfig,
): { x: number; y: number } {
  let px = (x - cfg.calibration.cx) / cfg.calibration.radius;
  let py = (y - cfg.calibration.cy) / cfg.calibration.radius;

  if (cfg.circular) {
    const mag = Math.hypot(px, py);
    const out = applyRadialDeadzone(Math.min(1, mag), cfg.deadzone);
    if (out === 0 || mag === 0) {
      px = 0;
      py = 0;
    } else {
      px = (px / mag) * out;
      py = (py / mag) * out;
    }
  } else {
    const sx = applyRadialDeadzone(Math.min(1, Math.abs(px)), cfg.deadzone);
    const sy = applyRadialDeadzone(Math.min(1, Math.abs(py)), cfg.deadzone);
    px = Math.sign(px) * sx;
    py = Math.sign(py) * sy;
  }

  if (cfg.invertX) px = -px;
  if (cfg.invertY) py = -py;
  // normalize -0 to 0 for stable equality in tests/UI
  return { x: clamp1(px) || 0, y: clamp1(py) || 0 };
}
