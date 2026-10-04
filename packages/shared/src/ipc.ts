import { z } from 'zod';
import { ProfileSchema } from './profile.js';
import { SettingsSchema } from './settings.js';

export const EngineSnapshotSchema = z.object({
  t: z.number(),                         // ms since engine start
  connected: z.boolean(),
  vigemReady: z.boolean(),
  reportHz: z.number(),
  pipelineP99Ms: z.number(),
  battery: z.object({ percent: z.number(), state: z.enum(['discharging', 'charging', 'full', 'unknown']) }),
  raw: z.object({ lx: z.number(), ly: z.number(), rx: z.number(), ry: z.number(), l2: z.number(), r2: z.number(),
                  buttons: z.record(z.string(), z.boolean()), gyro: z.object({ x: z.number(), y: z.number(), z: z.number() }) }),
  out: z.object({ lx: z.number(), ly: z.number(), rx: z.number(), ry: z.number(), lt: z.number(), rt: z.number(),
                  buttons: z.record(z.string(), z.boolean()) }),
});
export type EngineSnapshot = z.infer<typeof EngineSnapshotSchema>;

/** UI rumble test: motor levels 0..1 (left = large motor) played for `ms`, then the game's rumble resumes. */
export const TestRumbleSchema = z.object({
  left: z.number().min(0).max(1), right: z.number().min(0).max(1), ms: z.number().int().min(50).max(2000),
}).strict();
export type TestRumble = z.infer<typeof TestRumbleSchema>;

export const EngineCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setProfile'), profile: ProfileSchema }),
  z.object({ type: z.literal('replay'), path: z.string() }),  // use a .hidlog instead of a device
  z.object({ type: z.literal('useDevice') }),
  z.object({ type: z.literal('uiFocused'), focused: z.boolean() }),
  z.object({ type: z.literal('setSettings'), settings: SettingsSchema }),
  z.object({ type: z.literal('runMacro'), id: z.string().min(1).max(64) }),   // play-test a macro of the running profile
  TestRumbleSchema.extend({ type: z.literal('testRumble') }),
  z.object({ type: z.literal('shutdown') }),
]);
export type EngineCommand = z.infer<typeof EngineCommandSchema>;

export const EngineEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), snapshot: EngineSnapshotSchema }),
  z.object({ type: z.literal('status'), connected: z.boolean(), vigemReady: z.boolean() }),
  z.object({ type: z.literal('error'), code: z.string(), msg: z.string() }),
]);
export type EngineEvent = z.infer<typeof EngineEventSchema>;

export const ProfileSummarySchema = z.object({ id: z.string().min(1), name: z.string().min(1), slot: z.number().int().min(1).max(4) });
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;
