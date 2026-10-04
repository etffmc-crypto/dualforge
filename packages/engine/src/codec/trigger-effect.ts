import type { TriggerEffect } from '@dualforge/shared';

/** 11 bytes: mode + 10 parameter bytes (DualSense simple trigger effects). */
export function encodeTriggerEffect(e: TriggerEffect): Uint8Array {
  const b = new Uint8Array(11);
  switch (e.mode) {
    case 'off': b[0] = 0x05; break;
    case 'resistance': b[0] = 0x01; b[1] = e.start; b[2] = e.force; break;
    case 'section': b[0] = 0x02; b[1] = e.start; b[2] = e.end; b[3] = e.force; break;
    case 'vibration': b[0] = 0x06; b[1] = e.frequency; b[2] = e.force; break;
  }
  return b;
}
