import { z } from 'zod';
import { DS_BUTTONS, type DsButton } from './dualsense.js';
import { X_BUTTONS } from './xinput.js';

const unit = z.number().min(0).max(1);

export const CurvePointSchema = z.tuple([unit, unit]);
export const CURVE_PRESETS = ['linear', 'aggressive', 'precise', 'scurve'] as const;
export const StickCurveSchema = z.union([
  z.object({ kind: z.literal('preset'), preset: z.enum(CURVE_PRESETS) }),
  z.object({ kind: z.literal('custom'), points: z.array(CurvePointSchema).length(8) }),
]);

export const MAX_CURVE_POINTS = 8;
const pct = z.number().min(0).max(100);

export const StickFilterSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['basic', 'advanced']).default('basic'),
  strength: pct, // 0 = off, 100 = heavy smoothing
  // advanced mode: [speed 0..1, strength 0..100] x 5
  curve: z.array(z.tuple([unit, pct])).length(5).default([[0, 0], [0.1, 0], [0.25, 0], [0.5, 0], [1, 0]]),
}).refine((f) => f.curve.every((p, i, a) => i === 0 || p[0] >= a[i - 1]![0]), { message: 'filter curve x must be non-decreasing' });

export const TriggerEffectSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('off') }),
  z.object({ mode: z.literal('resistance'), start: z.number().int().min(0).max(9), force: z.number().int().min(0).max(8) }),
  z.object({ mode: z.literal('section'), start: z.number().int().min(0).max(9), end: z.number().int().min(0).max(9), force: z.number().int().min(0).max(8) }),
  z.object({ mode: z.literal('vibration'), frequency: z.number().int().min(1).max(255), force: z.number().int().min(0).max(8) }),
]);
export type TriggerEffect = z.infer<typeof TriggerEffectSchema>;

export const StickConfigSchema = z.object({
  calibration: z.object({ cx: z.number().min(-1).max(1), cy: z.number().min(-1).max(1), radius: z.number().min(0.5).max(1.5) }),
  deadzone: z.object({ center: unit, anti: unit, outer: unit }),
  circular: z.boolean(),
  invertX: z.boolean(),
  invertY: z.boolean(),
  curve: StickCurveSchema,
  filter: StickFilterSchema,
})
  .refine((s) => s.deadzone.center < 1 - s.deadzone.outer, { message: 'center deadzone overlaps outer' })
  .refine((s) => s.curve.kind === 'preset' || s.curve.points.every((p, i, a) => i === 0 || p[0] >= a[i - 1]![0]), { message: 'curve x must be non-decreasing' });
export type StickConfig = z.infer<typeof StickConfigSchema>;
export type StickConfigInput = z.input<typeof StickConfigSchema>;

export const TriggerConfigSchema = z.object({
  deadzone: z.object({ initial: unit, max: unit }),
  hairTrigger: z.union([
    z.object({ mode: z.literal('off') }),
    z.object({ mode: z.literal('fixed') }),              // any press past `initial` = full
    z.object({ mode: z.literal('adaptive'), value: z.number().min(1).max(100) }),
  ]),
  curve: z.enum(CURVE_PRESETS),
  effect: TriggerEffectSchema.default({ mode: 'off' }),
  digital: z.boolean().default(true),   // digital (click) trigger hardware: analog value ignored, button drives output
}).refine((t) => t.deadzone.initial < t.deadzone.max, { message: 'trigger initial must be < max' });
export type TriggerConfig = z.infer<typeof TriggerConfigSchema>;
export type TriggerConfigInput = z.input<typeof TriggerConfigSchema>;

export const TargetSchema = z.union([
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('xbutton'), button: z.enum(X_BUTTONS) }),
  z.object({ type: z.literal('key'), code: z.string().min(1) }),     // Windows VK name, e.g. "VK_SPACE"
  z.object({ type: z.literal('mouse'), button: z.enum(['left', 'right', 'middle']) }),
  z.object({ type: z.literal('macro'), macroId: z.string().min(1) }),
  z.object({ type: z.literal('xtrigger'), trigger: z.enum(['lt', 'rt']) }),   // full pull
]);
export type Target = z.infer<typeof TargetSchema>;

export const MacroStepSchema = z.object({
  target: TargetSchema,
  holdMs: z.number().int().min(0).max(10000),
  delayMs: z.number().int().min(0).max(10000),
});
export const MacroSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  steps: z.array(MacroStepSchema).min(1).max(64),
  loop: z.boolean().default(false),
});
export type Macro = z.infer<typeof MacroSchema>;

export const GyroConfigSchema = z.object({
  output: z.enum(['off', 'rightStick', 'mouse']).default('off'),
  activate: z.enum(['always', 'hold', 'toggle']).default('always'),
  activateButton: z.enum(DS_BUTTONS).nullable().default(null),
  deadzoneDps: z.number().min(0).max(50).default(2),
  sensitivityX: z.number().min(0.05).max(20).default(1),
  sensitivityY: z.number().min(0.05).max(20).default(1),
  invertX: z.boolean().default(false),
  invertY: z.boolean().default(false),
  curve: z.enum(CURVE_PRESETS).default('linear'),
  bias: z.object({ x: z.number(), y: z.number(), z: z.number() }).default({ x: 0, y: 0, z: 0 }),
});
export type GyroConfig = z.infer<typeof GyroConfigSchema>;
export const MappingSchema = z.object({
  targets: z.array(TargetSchema).min(1).max(3),
  turboHz: z.number().min(0).max(30),   // 0 = off
  continuous: z.boolean(),
});
export type Mapping = z.infer<typeof MappingSchema>;

export const ProfileSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  sticks: z.object({ left: StickConfigSchema, right: StickConfigSchema }),
  triggers: z.object({ left: TriggerConfigSchema, right: TriggerConfigSchema }),
  vibration: z.object({ left: z.number().min(0).max(100), right: z.number().min(0).max(100) }),
  lights: z.object({
    r: z.number().int().min(0).max(255), g: z.number().int().min(0).max(255), b: z.number().int().min(0).max(255),
    brightness: z.number().int().min(0).max(2), // 0 high, 1 medium, 2 low (DualSense semantics)
    playerLeds: z.number().int().min(0).max(31),
    mode: z.enum(['off', 'static', 'breathing', 'rainbow', 'battery']).default('static'),
    speed: z.number().min(0).max(100).default(40),
    micLed: z.number().int().min(0).max(2).default(0),
  }),
  mappings: z.record(z.enum(DS_BUTTONS), MappingSchema),
  gyro: GyroConfigSchema.default({}),
  macros: z.array(MacroSchema).max(32).default([]),
}).refine(
  (p) => {
    const ids = new Set(p.macros.map((m) => m.id));
    return Object.values(p.mappings).every((m) => m.targets.every((t) => t.type !== 'macro' || ids.has(t.macroId)));
  },
  { message: 'mapping references an unknown macro id' },
);
export type Profile = z.infer<typeof ProfileSchema>;

function defaultStick(): StickConfig {
  return {
    calibration: { cx: 0, cy: 0, radius: 1 },
    deadzone: { center: 0.05, anti: 0, outer: 0.02 },
    circular: true, invertX: false, invertY: false,
    curve: { kind: 'preset', preset: 'linear' },
    filter: { enabled: false, mode: 'basic', strength: 0, curve: [[0, 0], [0.1, 0], [0.25, 0], [0.5, 0], [1, 0]] },
  };
}
function defaultTrigger(): TriggerConfig {
  return { deadzone: { initial: 0.02, max: 0.98 }, hairTrigger: { mode: 'off' }, curve: 'linear', effect: { mode: 'off' }, digital: true };
}
const DEFAULT_TARGET: Record<DsButton, Target> = {
  cross: { type: 'xbutton', button: 'A' }, circle: { type: 'xbutton', button: 'B' },
  square: { type: 'xbutton', button: 'X' }, triangle: { type: 'xbutton', button: 'Y' },
  l1: { type: 'xbutton', button: 'LB' }, r1: { type: 'xbutton', button: 'RB' },
  l2: { type: 'xtrigger', trigger: 'lt' }, r2: { type: 'xtrigger', trigger: 'rt' },
  l3: { type: 'xbutton', button: 'LS' }, r3: { type: 'xbutton', button: 'RS' },
  create: { type: 'xbutton', button: 'BACK' }, options: { type: 'xbutton', button: 'START' },
  ps: { type: 'xbutton', button: 'GUIDE' }, touchpad: { type: 'none' }, mic: { type: 'none' },
  dpadUp: { type: 'xbutton', button: 'DPAD_UP' }, dpadDown: { type: 'xbutton', button: 'DPAD_DOWN' },
  dpadLeft: { type: 'xbutton', button: 'DPAD_LEFT' }, dpadRight: { type: 'xbutton', button: 'DPAD_RIGHT' },
};

export function defaultProfile(id: string, name: string): Profile {
  return {
    schemaVersion: 1, id, name,
    sticks: { left: defaultStick(), right: defaultStick() },
    triggers: { left: defaultTrigger(), right: defaultTrigger() },
    vibration: { left: 100, right: 100 },
    lights: { r: 0, g: 80, b: 255, brightness: 0, playerLeds: 0b00100, mode: 'static', speed: 40, micLed: 0 },
    mappings: Object.fromEntries(
      DS_BUTTONS.map((b) => [b, { targets: [DEFAULT_TARGET[b]], turboHz: 0, continuous: false }]),
    ) as Record<DsButton, Mapping>,
    gyro: GyroConfigSchema.parse({}),
    macros: [],
  };
}
