import type { StickConfig } from '@dualforge/shared';

type Filter = StickConfig['filter'];

/** Signed strength readout: "-40 (jitter)", "+30 (smooth)" or "Off". */
export const strengthReadout = (v: number): string =>
  v === 0 ? 'Off' : v < 0 ? `${v} (jitter)` : `+${v} (smooth)`;

/** Jitter rate readout: "30 Hz". */
export const jitterRateReadout = (v: number): string => `${v} Hz`;

/** True when the active filter setting can add jitter (negative strength or any negative curve point). */
export const hasNegative = (f: Filter): boolean =>
  f.mode === 'basic' ? f.strength < 0 : f.curve.some(([, y]) => y < 0);

/** One-line summary for the Overview Sticks card. */
export function smoothingSummary(f: Filter): string {
  if (!f.enabled) return 'Off';
  if (f.mode === 'basic') return strengthReadout(f.strength);
  return hasNegative(f) ? 'By speed (jitter)' : 'By speed';
}
