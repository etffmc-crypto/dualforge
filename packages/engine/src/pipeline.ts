import { emptyXInput, type RawState, type XInputState } from '@dualforge/shared';
import { applyAntiDeadzone, applyStickShaping } from './stages/stick-shape.js';
import { applyStickLut } from './stages/stick-curve.js';
import { applyStickFilter, createFilterState, MIN_DT_MS, type FilterState } from './stages/stick-filter.js';
import { applyTrigger, createTriggerState, type TriggerState } from './stages/triggers.js';
import type { CompiledProfile } from './compile.js';
import { applyGyro, createGyroState, type GyroState } from './stages/gyro.js';
import { createMacroState, startMacro, tickMacros, type MacroState } from './stages/macros.js';
import { applyMappings, createMappingState, diffTransitions, type MappingState, type MouseButton, type OutputFrame } from './stages/mapping.js';

export interface PipelineState {
  filterL: FilterState; filterR: FilterState;
  trigL: TriggerState; trigR: TriggerState;
  mapping: MappingState;
  macros: MacroState;
  gyro: GyroState;
  macroOut: { xinput: XInputState; keysWanted: Set<string>; mouseWanted: Set<MouseButton> };
  lastMs: number;
}
export const createPipelineState = (): PipelineState => ({
  filterL: createFilterState(), filterR: createFilterState(),
  trigL: createTriggerState(), trigR: createTriggerState(),
  mapping: createMappingState(), macros: createMacroState(), gyro: createGyroState(),
  macroOut: { xinput: emptyXInput(), keysWanted: new Set(), mouseWanted: new Set() }, lastMs: -1,
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

  const g = applyGyro(raw, cp.profile.gyro, cp.gyroLut, s.gyro, dt);
  if (g.active && cp.profile.gyro.output === 'rightStick') {
    r.x += g.rx; r.y += g.ry;
    const mag = Math.hypot(r.x, r.y);
    if (mag > 1) { r.x /= mag; r.y /= mag; }
  }

  const x = emptyXInput();
  x.lx = l.x; x.ly = l.y; x.rx = r.x; x.ry = r.y; x.lt = lt; x.rt = rt;
  const frame = applyMappings(raw, cp.profile, s.mapping, nowMs, x, cp.analogTargets);
  if (g.active && cp.profile.gyro.output === 'mouse') { frame.mouseMove.dx = g.dx; frame.mouseMove.dy = g.dy; }
  for (const id of frame.macroStarts) startMacro(s.macros, id, nowMs, cp.macros);
  const mo = s.macroOut;
  mo.xinput = frame.xinput; mo.keysWanted = s.mapping.wantKeys; mo.mouseWanted = s.mapping.wantMouse;
  tickMacros(s.macros, nowMs, cp.macros, mo);
  diffTransitions(s.mapping.wantKeys, s.mapping.wantMouse, s.mapping, frame);
  return frame;
}
