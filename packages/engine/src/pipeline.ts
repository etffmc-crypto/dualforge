import type { Profile, RawState } from '@dualforge/shared';
import { applyStickShaping } from './stages/stick-shape.js';
import { applyStickCurve } from './stages/stick-curve.js';
import { applyStickFilter, createFilterState, type FilterState } from './stages/stick-filter.js';
import { applyTrigger, createTriggerState, type TriggerState } from './stages/triggers.js';
import { applyMappings, createMappingState, type MappingState, type OutputFrame } from './stages/mapping.js';

export interface PipelineState {
  filterL: FilterState; filterR: FilterState;
  trigL: TriggerState; trigR: TriggerState;
  mapping: MappingState;
  lastMs: number;
}
export const createPipelineState = (): PipelineState => ({
  filterL: createFilterState(), filterR: createFilterState(),
  trigL: createTriggerState(), trigR: createTriggerState(),
  mapping: createMappingState(), lastMs: -1,
});

export function processReport(raw: RawState, profile: Profile, s: PipelineState, nowMs: number): OutputFrame {
  const dt = s.lastMs < 0 ? 1 : Math.max(0.01, nowMs - s.lastMs);
  s.lastMs = nowMs;

  const frame = applyMappings(raw, profile, s.mapping, nowMs);

  const L = profile.sticks.left, R = profile.sticks.right;
  let l = applyStickShaping(raw.lx, raw.ly, L);
  l = applyStickCurve(l.x, l.y, L.curve);
  l = applyStickFilter(l.x, l.y, L.filter, s.filterL, dt);
  let r = applyStickShaping(raw.rx, raw.ry, R);
  r = applyStickCurve(r.x, r.y, R.curve);
  r = applyStickFilter(r.x, r.y, R.filter, s.filterR, dt);

  frame.xinput.lx = l.x; frame.xinput.ly = l.y;
  frame.xinput.rx = r.x; frame.xinput.ry = r.y;
  frame.xinput.lt = applyTrigger(raw.l2, profile.triggers.left, s.trigL);
  frame.xinput.rt = applyTrigger(raw.r2, profile.triggers.right, s.trigR);
  return frame;
}
