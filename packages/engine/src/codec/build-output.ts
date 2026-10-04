import type { TriggerEffect } from '@dualforge/shared';
import { encodeTriggerEffect } from './trigger-effect.js';

export const USB_OUTPUT_REPORT_ID = 0x02;
export const USB_OUTPUT_REPORT_LEN = 48;

export interface Feedback {
  rumbleLeft: number;   // 0..1 (large motor)
  rumbleRight: number;  // 0..1 (small motor)
  lightbar: { r: number; g: number; b: number };
  brightness: 0 | 1 | 2;
  playerLeds: number;   // 5-bit mask
  micLed: 0 | 1 | 2;    // off, on, pulse
  triggers?: { left: TriggerEffect; right: TriggerEffect }; // default: both off
}

const OFF: TriggerEffect = { mode: 'off' };
const u8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export function buildOutputReport(fb: Feedback): Uint8Array {
  const r = new Uint8Array(USB_OUTPUT_REPORT_LEN);
  r[0] = USB_OUTPUT_REPORT_ID;
  r[1] = 0x01 | 0x02 | 0x04 | 0x08;     // compatible vibration, haptics select, right/left trigger effects (always set: also clears)
  r[2] = 0x01 | 0x04 | 0x10;             // mic LED, lightbar, player LEDs
  r[3] = u8(fb.rumbleRight * 255);
  r[4] = u8(fb.rumbleLeft * 255);
  const t = fb.triggers ?? { left: OFF, right: OFF };
  r.set(encodeTriggerEffect(t.right), 11);
  r.set(encodeTriggerEffect(t.left), 22);
  r[9] = fb.micLed;
  r[39] = 0x02 | 0x04;                   // lightbar setup, improved rumble
  r[42] = 0x02;
  r[43] = fb.brightness;
  r[44] = fb.playerLeds & 0x1f;
  r[45] = u8(fb.lightbar.r); r[46] = u8(fb.lightbar.g); r[47] = u8(fb.lightbar.b);
  return r;
}
