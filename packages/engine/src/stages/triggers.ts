import type { TriggerConfig } from '@dualforge/shared';
import { evaluateCurve, presetPoints } from './stick-curve.js';

export interface TriggerState { engaged: boolean }
export const createTriggerState = (): TriggerState => ({ engaged: false });

export function applyTrigger(v: number, cfg: TriggerConfig, s: TriggerState): number {
  const { initial, max } = cfg.deadzone;
  let t = v <= initial ? 0 : v >= max ? 1 : (v - initial) / Math.max(1e-6, max - initial);

  const ht = cfg.hairTrigger;
  if (ht.mode === 'fixed') {
    t = t > 0 ? 1 : 0;
  } else if (ht.mode === 'adaptive') {
    const thr = ht.value / 100;
    const rel = Math.max(0, thr - 0.1);
    if (s.engaged) { if (t <= rel) s.engaged = false; }
    else if (t >= thr) s.engaged = true;
    if (s.engaged) t = 1;
  }
  return evaluateCurve(presetPoints(cfg.curve), t);
}
