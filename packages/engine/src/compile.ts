import {
  defaultSettings,
  type Macro,
  type Profile,
  type Target,
  type StickConfig,
  type TriggerConfig,
  type TurboSettings,
} from '@dualforge/shared';
import { buildCurveLut, presetPoints, LUT_SIZE } from './stages/stick-curve.js';

export { LUT_SIZE };

export interface CompiledStick {
  cfg: StickConfig;
  lut: Float32Array;
}
export interface CompiledTrigger {
  cfg: TriggerConfig;
  lut: Float32Array;
}
export interface CompiledProfile {
  profile: Profile;
  left: CompiledStick;
  right: CompiledStick;
  lt: CompiledTrigger;
  rt: CompiledTrigger;
  macros: Map<string, Macro>;
  gyroLut: Float32Array;
  /** Mapping targets (by identity) that must not override the analog trigger value (analog hardware + xtrigger on its own side). */
  analogTargets: Set<Target>;
  /** On-pad turbo settings (from Settings) the mapping stage runs with. */
  turbo: TurboSettings;
  /** Some mapping has turbo set (drives the red lightbar pulse). */
  turboConfigured: boolean;
}

const stick = (cfg: StickConfig): CompiledStick => ({
  cfg,
  lut: buildCurveLut(
    cfg.curve.kind === 'preset' ? presetPoints(cfg.curve.preset) : cfg.curve.points,
  ),
});
const trig = (cfg: TriggerConfig): CompiledTrigger => ({
  cfg,
  lut: buildCurveLut(presetPoints(cfg.curve)),
});

function analogTargetsOf(profile: Profile): Set<Target> {
  const out = new Set<Target>();
  const side = (button: 'l2' | 'r2', trigger: 'lt' | 'rt', digital: boolean) => {
    if (digital) return;
    for (const t of profile.mappings[button]?.targets ?? [])
      if (t.type === 'xtrigger' && t.trigger === trigger) out.add(t);
  };
  side('l2', 'lt', profile.triggers.left.digital);
  side('r2', 'rt', profile.triggers.right.digital);
  return out;
}

/** `settings` supplies the on-pad turbo settings the mapping stage needs (defaults when omitted). */
export function compileProfile(
  profile: Profile,
  settings?: { turbo: TurboSettings },
): CompiledProfile {
  return {
    turbo: settings?.turbo ?? defaultSettings().turbo,
    turboConfigured: Object.values(profile.mappings).some((m) => m.turbo.mode !== 'off'),
    analogTargets: analogTargetsOf(profile),
    profile,
    left: stick(profile.sticks.left),
    right: stick(profile.sticks.right),
    lt: trig(profile.triggers.left),
    rt: trig(profile.triggers.right),
    gyroLut: buildCurveLut(presetPoints(profile.gyro.curve)),
    macros: new Map(profile.macros.map((m) => [m.id, m])),
  };
}
