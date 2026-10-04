import type { RawState } from '@dualforge/shared';
import { applyStickShaping } from './stages/stick-shape.js';
import { applyStickLut } from './stages/stick-curve.js';
import { applyStickFilter, createFilterState, MIN_DT_MS, type FilterState } from './stages/stick-filter.js';
import { applyTrigger, createTriggerState, type TriggerState } from './stages/triggers.js';
import type { CompiledProfile } from './compile.js';
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

export function processReport(raw: RawState, cp: CompiledProfile, s: PipelineState, nowMs: number): OutputFrame {
  const dt = s.lastMs < 0 ? 1 : Math.max(MIN_DT_MS, nowMs - s.lastMs);
  s.lastMs = nowMs;

  const L = cp.left, R = cp.right;
  let l = applyStickShaping(raw.lx, raw.ly, L.cfg);
  l = applyStickLut(l.x, l.y, L.lut);
  l = applyStickFilter(l.x, l.y, L.cfg.filter, s.filterL, dt);
  let r = applyStickShaping(raw.rx, raw.ry, R.cfg);
  r = applyStickLut(r.x, r.y, R.lut);
  r = applyStickFilter(r.x, r.y, R.cfg.filter, s.filterR, dt);
  const lt = applyTrigger(raw.l2, cp.lt.cfg, cp.lt.lut, s.trigL);
  const rt = applyTrigger(raw.r2, cp.rt.cfg, cp.rt.lut, s.trigR);

  // Spec order: sticks -> triggers -> mappings last. Plan 3 will let applyMappings accept a pre-filled
  // xinput so button->axis targets can override; assigning axes after is equivalent until then.
  const frame = applyMappings(raw, cp.profile, s.mapping, nowMs);
  frame.xinput.lx = l.x; frame.xinput.ly = l.y;
  frame.xinput.rx = r.x; frame.xinput.ry = r.y;
  frame.xinput.lt = lt; frame.xinput.rt = rt;
  return frame;
}
