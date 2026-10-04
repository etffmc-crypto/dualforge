import { emptyXInput, type RawState } from '@dualforge/shared';
import { applyAntiDeadzone, applyStickShaping } from './stages/stick-shape.js';
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
  l = applyAntiDeadzone(l.x, l.y, L.cfg.deadzone.anti);
  l = applyStickFilter(l.x, l.y, L.cfg.filter, s.filterL, dt);
  let r = applyStickShaping(raw.rx, raw.ry, R.cfg);
  r = applyStickLut(r.x, r.y, R.lut);
  r = applyAntiDeadzone(r.x, r.y, R.cfg.deadzone.anti);
  r = applyStickFilter(r.x, r.y, R.cfg.filter, s.filterR, dt);
  const lt = applyTrigger(raw.l2, cp.lt.cfg, cp.lt.lut, s.trigL);
  const rt = applyTrigger(raw.r2, cp.rt.cfg, cp.rt.lut, s.trigR);

  const x = emptyXInput();
  x.lx = l.x; x.ly = l.y; x.rx = r.x; x.ry = r.y; x.lt = lt; x.rt = rt;
  return applyMappings(raw, cp.profile, s.mapping, nowMs, x);
}
