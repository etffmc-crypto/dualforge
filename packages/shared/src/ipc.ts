import { z } from 'zod';
import { DS_BUTTONS } from './dualsense.js';
import { ProfileSchema, TurboSchema } from './profile.js';

export const TurboEditSchema = z.object({ button: z.enum(DS_BUTTONS), turbo: TurboSchema });
export type TurboEdit = z.infer<typeof TurboEditSchema>;
import { SettingsSchema } from './settings.js';

/** A touchpad finger: x 0..1919, y 0..1079 (DualSense touchpad units). */
export const TouchPointSchema = z.object({
  active: z.boolean(),
  id: z.number(),
  x: z.number(),
  y: z.number(),
});

export const EngineSnapshotSchema = z.object({
  t: z.number(), // ms since engine start
  connected: z.boolean(),
  /** Where the input comes from: the controller, or a recorded .hidlog being replayed. */
  source: z.enum(['device', 'replay']).default('device'),
  vigemReady: z.boolean(),
  reportHz: z.number(),
  pipelineP99Ms: z.number(),
  battery: z.object({
    percent: z.number(),
    state: z.enum(['discharging', 'charging', 'full', 'unknown']),
  }),
  raw: z.object({
    lx: z.number(),
    ly: z.number(),
    rx: z.number(),
    ry: z.number(),
    l2: z.number(),
    r2: z.number(),
    buttons: z.record(z.string(), z.boolean()),
    gyro: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    touch: z.array(TouchPointSchema).max(2).default([]),
  }),
  out: z.object({
    lx: z.number(),
    ly: z.number(),
    rx: z.number(),
    ry: z.number(),
    lt: z.number(),
    rt: z.number(),
    buttons: z.record(z.string(), z.boolean()),
  }),
  /** Some turbo button is firing right now (held in hold mode, or latched in toggle mode). */
  turboActive: z.boolean().optional(),
  /** Some mapping of the running profile has turbo set. */
  turboConfigured: z.boolean().optional(),
});
export type EngineSnapshot = z.infer<typeof EngineSnapshotSchema>;

/** UI rumble test: motor levels 0..1 (left = large motor) played for `ms`, then the game's rumble resumes. */
export const TestRumbleSchema = z
  .object({
    left: z.number().min(0).max(1),
    right: z.number().min(0).max(1),
    ms: z.number().int().min(50).max(2000),
  })
  .strict();
export type TestRumble = z.infer<typeof TestRumbleSchema>;

export const EngineCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setProfile'), profile: ProfileSchema }),
  z.object({ type: z.literal('replay'), path: z.string() }), // use a .hidlog instead of a device
  z.object({ type: z.literal('useDevice') }),
  z.object({ type: z.literal('uiFocused'), focused: z.boolean() }),
  z.object({ type: z.literal('setSettings'), settings: SettingsSchema }),
  z.object({ type: z.literal('runMacro'), id: z.string().min(1).max(64) }), // play-test a macro of the running profile
  TestRumbleSchema.extend({ type: z.literal('testRumble') }),
  z.object({ type: z.literal('shutdown') }),
]);
export type EngineCommand = z.infer<typeof EngineCommandSchema>;

/** The on-pad turbo combo changed mappings of profile `profileId`; main persists them like a UI edit. */
export const ProfileEditEventSchema = z.object({
  type: z.literal('profileEdit'),
  profileId: z.string().min(1),
  edits: z.array(TurboEditSchema).min(1).max(DS_BUTTONS.length),
});
export type ProfileEditEvent = z.infer<typeof ProfileEditEventSchema>;

export const EngineEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), snapshot: EngineSnapshotSchema }),
  z.object({ type: z.literal('status'), connected: z.boolean(), vigemReady: z.boolean() }),
  z.object({ type: z.literal('error'), code: z.string(), msg: z.string() }),
  ProfileEditEventSchema,
]);
export type EngineEvent = z.infer<typeof EngineEventSchema>;

export const ProfileSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slot: z.number().int().min(1).max(4),
});
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;
