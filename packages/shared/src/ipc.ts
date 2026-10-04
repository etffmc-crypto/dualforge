import { z } from 'zod';
import { ProfileSchema } from './profile.js';

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

export const EngineCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setProfile'), profile: ProfileSchema }),
  z.object({ type: z.literal('replay'), path: z.string() }),  // use a .hidlog instead of a device
  z.object({ type: z.literal('useDevice') }),
  z.object({ type: z.literal('shutdown') }),
]);
export type EngineCommand = z.infer<typeof EngineCommandSchema>;

export const EngineEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), snapshot: EngineSnapshotSchema }),
  z.object({ type: z.literal('status'), connected: z.boolean(), vigemReady: z.boolean() }),
  z.object({ type: z.literal('error'), code: z.string(), msg: z.string() }),
]);
export type EngineEvent = z.infer<typeof EngineEventSchema>;
