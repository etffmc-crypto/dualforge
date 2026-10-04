import type { Macro, Profile, StickConfig, TriggerConfig } from '@dualforge/shared';
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
}

const stick = (cfg: StickConfig): CompiledStick => ({
  cfg, lut: buildCurveLut(cfg.curve.kind === 'preset' ? presetPoints(cfg.curve.preset) : cfg.curve.points),
});
const trig = (cfg: TriggerConfig): CompiledTrigger => ({ cfg, lut: buildCurveLut(presetPoints(cfg.curve)) });

export function compileProfile(profile: Profile): CompiledProfile {
  return {
    profile,
    left: stick(profile.sticks.left), right: stick(profile.sticks.right),
    lt: trig(profile.triggers.left), rt: trig(profile.triggers.right),
    gyroLut: buildCurveLut(presetPoints(profile.gyro.curve)),
    macros: new Map(profile.macros.map((m) => [m.id, m])),
  };
}
