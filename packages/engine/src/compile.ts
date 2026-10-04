import type { Macro, Profile, Target, StickConfig, TriggerConfig } from '@dualforge/shared';
import { buildCurveLut, presetPoints, LUT_SIZE } from './stages/stick-curve.js';

export { LUT_SIZE };

export interface CompiledStick { cfg: StickConfig; lut: Float32Array }
export interface CompiledTrigger { cfg: TriggerConfig; lut: Float32Array }
export interface CompiledProfile {
  profile: Profile;
  left: CompiledStick; right: CompiledStick;
  lt: CompiledTrigger; rt: CompiledTrigger;
  macros: Map<string, Macro>;
  gyroLut: Float32Array;
  /** Mapping targets (by identity) that must not override the analog trigger value (analog hardware + xtrigger on its own side). */
  analogTargets: Set<Target>;
}

const stick = (cfg: StickConfig): CompiledStick => ({
  cfg, lut: buildCurveLut(cfg.curve.kind === 'preset' ? presetPoints(cfg.curve.preset) : cfg.curve.points),
});
const trig = (cfg: TriggerConfig): CompiledTrigger => ({ cfg, lut: buildCurveLut(presetPoints(cfg.curve)) });

function analogTargetsOf(profile: Profile): Set<Target> {
  const out = new Set<Target>();
  const side = (button: 'l2' | 'r2', trigger: 'lt' | 'rt', digital: boolean) => {
    if (digital) return;
    for (const t of profile.mappings[button]?.targets ?? []) if (t.type === 'xtrigger' && t.trigger === trigger) out.add(t);
  };
  side('l2', 'lt', profile.triggers.left.digital);
  side('r2', 'rt', profile.triggers.right.digital);
  return out;
}

export function compileProfile(profile: Profile): CompiledProfile {
  return {
    analogTargets: analogTargetsOf(profile),
    profile,
    left: stick(profile.sticks.left), right: stick(profile.sticks.right),
    lt: trig(profile.triggers.left), rt: trig(profile.triggers.right),
    gyroLut: buildCurveLut(presetPoints(profile.gyro.curve)),
    macros: new Map(profile.macros.map((m) => [m.id, m])),
  };
}
