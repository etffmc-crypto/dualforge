import { emptyButtons, type RawState, type TouchPoint } from '@dualforge/shared';

export const DUALSENSE_VID = 0x054c;
export const DUALSENSE_PID = 0x0ce6;
export const USB_INPUT_REPORT_ID = 0x01;
export const USB_INPUT_REPORT_LEN = 64;

const axis = (v: number) => (v - 127.5) / 127.5;
const i16 = (b: Uint8Array, o: number) => {
  const v = (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
  return v > 0x7fff ? v - 0x10000 : v;
};
const touch = (b: Uint8Array, o: number): TouchPoint => {
  const b0 = b[o] ?? 0,
    b1 = b[o + 1] ?? 0,
    b2 = b[o + 2] ?? 0,
    b3 = b[o + 3] ?? 0;
  return {
    active: (b0 & 0x80) === 0,
    id: b0 & 0x7f,
    x: b1 | ((b2 & 0x0f) << 8),
    y: (b2 >> 4) | (b3 << 4),
  };
};

export function parseDualSenseUsb(b: Uint8Array): RawState {
  if (b.length < USB_INPUT_REPORT_LEN) throw new Error(`E_REPORT_LEN: ${b.length}`);
  if (b[0] !== USB_INPUT_REPORT_ID) throw new Error(`E_REPORT_ID: ${b[0]}`);

  const buttons = emptyButtons();
  const b8 = b[8] ?? 0x08,
    b9 = b[9] ?? 0,
    b10 = b[10] ?? 0;
  const dpad = b8 & 0x0f;
  buttons.dpadUp = dpad === 7 || dpad === 0 || dpad === 1;
  buttons.dpadRight = dpad >= 1 && dpad <= 3;
  buttons.dpadDown = dpad >= 3 && dpad <= 5;
  buttons.dpadLeft = dpad >= 5 && dpad <= 7;
  buttons.square = !!(b8 & 0x10);
  buttons.cross = !!(b8 & 0x20);
  buttons.circle = !!(b8 & 0x40);
  buttons.triangle = !!(b8 & 0x80);
  buttons.l1 = !!(b9 & 0x01);
  buttons.r1 = !!(b9 & 0x02);
  buttons.l2 = !!(b9 & 0x04);
  buttons.r2 = !!(b9 & 0x08);
  buttons.create = !!(b9 & 0x10);
  buttons.options = !!(b9 & 0x20);
  buttons.l3 = !!(b9 & 0x40);
  buttons.r3 = !!(b9 & 0x80);
  buttons.ps = !!(b10 & 0x01);
  buttons.touchpad = !!(b10 & 0x02);
  buttons.mic = !!(b10 & 0x04);

  const bat = b[53] ?? 0;
  const stateCode = bat >> 4;
  const state =
    stateCode === 0
      ? 'discharging'
      : stateCode === 1
        ? 'charging'
        : stateCode === 2
          ? 'full'
          : 'unknown';

  return {
    lx: axis(b[1] ?? 128),
    ly: -axis(b[2] ?? 128),
    rx: axis(b[3] ?? 128),
    ry: -axis(b[4] ?? 128),
    l2: (b[5] ?? 0) / 255,
    r2: (b[6] ?? 0) / 255,
    buttons,
    gyro: { x: i16(b, 16), y: i16(b, 18), z: i16(b, 20) },
    accel: { x: i16(b, 22), y: i16(b, 24), z: i16(b, 26) },
    touch: [touch(b, 33), touch(b, 37)],
    battery: { percent: Math.min(100, (bat & 0x0f) * 10), state },
    seq: b[7] ?? 0,
  };
}
