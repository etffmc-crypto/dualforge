import type { GyroConfig, RawState } from '@dualforge/shared';
import { evaluateLut } from './stick-curve.js';

/** DualSense gyro: +-2000 dps over int16. */
export const GYRO_LSB_PER_DPS = 16.384;
/** Mouse px per (sensitivity * degree) = 10 (brief). */
const MOUSE_PX_PER_DEG = 10;
/** Stick: full deflection at (STICK_FULL_DPS / sensitivity) deg/s. */
const STICK_FULL_DPS = 200;

export interface GyroResult {
  rx: number;
  ry: number;
  dx: number;
  dy: number;
  active: boolean;
}
export interface GyroState {
  toggled: boolean;
  prevActivate: boolean;
  mouseAccX: number;
  mouseAccY: number;
  /** Reused result object (hot path: no per-report allocation). Valid until the next applyGyro call. */
  out: GyroResult;
}
export const createGyroState = (): GyroState => ({
  toggled: false,
  prevActivate: false,
  mouseAccX: 0,
  mouseAccY: 0,
  out: { rx: 0, ry: 0, dx: 0, dy: 0, active: false },
});

const dz = (v: number, t: number): number => (Math.abs(v) < t ? 0 : v);
const stick = (lut: Float32Array, dps: number, sens: number): number =>
  Math.sign(dps) * evaluateLut(lut, Math.min(1, Math.abs(dps) / (STICK_FULL_DPS / sens)));

/**
 * Axis convention: raw.gyro.y = yaw (turn left +), raw.gyro.x = pitch (nose up +).
 * Turning the pad right gives rx > 0 / mouse dx > 0; pitching up gives ry > 0 / mouse dy < 0 (screen coordinates).
 */
export function applyGyro(
  raw: RawState,
  cfg: GyroConfig,
  lut: Float32Array,
  s: GyroState,
  dtMs: number,
): GyroResult {
  const o = s.out;
  o.rx = 0;
  o.ry = 0;
  o.dx = 0;
  o.dy = 0;

  const down = cfg.activateButton ? raw.buttons[cfg.activateButton] === true : false;
  if (cfg.activate === 'toggle' && down && !s.prevActivate) s.toggled = !s.toggled;
  s.prevActivate = down;
  const on = cfg.activate === 'always' ? true : cfg.activate === 'hold' ? down : s.toggled;
  o.active = on && cfg.output !== 'off';
  if (!o.active) {
    s.mouseAccX = 0;
    s.mouseAccY = 0;
    return o;
  }

  const yaw = dz((raw.gyro.y - cfg.bias.y) / GYRO_LSB_PER_DPS, cfg.deadzoneDps);
  const pitch = dz((raw.gyro.x - cfg.bias.x) / GYRO_LSB_PER_DPS, cfg.deadzoneDps);
  const sx = cfg.invertX ? 1 : -1; // yaw-left (+) -> stick/mouse left (-) unless inverted
  const sy = cfg.invertY ? -1 : 1; // pitch-up (+) -> stick up (+) unless inverted

  if (cfg.output === 'rightStick') {
    o.rx = sx * stick(lut, yaw, cfg.sensitivityX) || 0;
    o.ry = sy * stick(lut, pitch, cfg.sensitivityY) || 0;
  } else {
    s.mouseAccX += sx * yaw * cfg.sensitivityX * (dtMs / 1000) * MOUSE_PX_PER_DEG;
    s.mouseAccY += -sy * pitch * cfg.sensitivityY * (dtMs / 1000) * MOUSE_PX_PER_DEG;
    const ix = Math.trunc(s.mouseAccX),
      iy = Math.trunc(s.mouseAccY);
    s.mouseAccX -= ix;
    s.mouseAccY -= iy;
    o.dx = ix;
    o.dy = iy;
  }
  return o;
}
