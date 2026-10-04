export const DS_BUTTONS = [
  'cross', 'circle', 'square', 'triangle',
  'l1', 'r1', 'l2', 'r2', 'l3', 'r3',
  'create', 'options', 'ps', 'touchpad', 'mic',
  'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
] as const;
export type DsButton = (typeof DS_BUTTONS)[number];

export interface TouchPoint {
  active: boolean;
  id: number;
  x: number; // 0..1919
  y: number; // 0..1079
}

export type BatteryState = 'discharging' | 'charging' | 'full' | 'unknown';
export interface Battery {
  percent: number; // 0..100
  state: BatteryState;
}

/** Normalized DualSense input. Sticks -1..1 with +Y = up; triggers 0..1. */
export interface RawState {
  lx: number; ly: number; rx: number; ry: number;
  l2: number; r2: number;
  buttons: Record<DsButton, boolean>;
  gyro: { x: number; y: number; z: number };   // raw int16
  accel: { x: number; y: number; z: number };  // raw int16
  touch: [TouchPoint, TouchPoint];
  battery: Battery;
  seq: number;
}

export function emptyButtons(): Record<DsButton, boolean> {
  return Object.fromEntries(DS_BUTTONS.map((b) => [b, false])) as Record<DsButton, boolean>;
}

/** Display names for UI (pills, chips, pickers). */
export const BUTTON_LABELS: Record<DsButton, string> = {
  cross: '✕', circle: '○', square: '□', triangle: '△',
  l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2', l3: 'L3', r3: 'R3',
  create: 'Create', options: 'Options', ps: 'PS', touchpad: 'Touchpad', mic: 'Mic',
  dpadUp: 'D-Pad ↑', dpadDown: 'D-Pad ↓', dpadLeft: 'D-Pad ←', dpadRight: 'D-Pad →',
};
