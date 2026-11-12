import { z } from 'zod';

/**
 * The USB polling rate of a DualSense that carries SweetLow's `hidusbf` lower filter (the "8 kHz" mod). On a USB
 * High Speed pad the filter's stored `bInterval` 1 = 8000 Hz, 2 = 4000, 3 = 2000, 4 = 1000. A stock pad has no
 * filter and is capped at 1 kHz, so the option is unavailable there.
 */
export const POLLING_RATES = [8000, 4000, 2000, 1000] as const;
export type PollingRateHz = (typeof POLLING_RATES)[number];

export interface PollingRateState {
  /** The picker is shown only when this is true. */
  available: boolean;
  /** Why not: no pad on USB, no hidusbf filter on it, the pad is not High Speed, or the query failed. */
  reason?: 'no-device' | 'no-filter' | 'not-high-speed' | 'query-failed';
  /** The stored rate; null when the filter has no value yet (the pad runs at its native rate). */
  rateHz: PollingRateHz | null;
  /** What the engine measures right now (0 while the pad is not being read). */
  measuredHz: number;
}
export interface PollingRateResult {
  ok: boolean;
  code?: string;
  msg?: string;
  state: PollingRateState;
}

/** `polling:set` payload. */
export const PollingSetSchema = z
  .object({ hz: z.union([z.literal(8000), z.literal(4000), z.literal(2000), z.literal(1000)]) })
  .strict();
export type PollingSetRequest = z.infer<typeof PollingSetSchema>;
