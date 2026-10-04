import { z } from 'zod';
import { ProfileIdSchema } from './profile.js';

export const MAX_AUTO_SWITCH_RULES = 32;
export const MAX_EXE_LENGTH = 64;

export const SettingsSchema = z.object({
  schemaVersion: z.literal(1),
  activeProfile: ProfileIdSchema.default('p1'),
  /** Per-game rules: while `exe` (case-insensitive basename) is in front, the engine runs `profileId`. */
  autoSwitch: z.array(z.object({ exe: z.string().min(1).max(MAX_EXE_LENGTH), profileId: ProfileIdSchema })).max(MAX_AUTO_SWITCH_RULES).default([]),
  hasRumble: z.boolean().default(false),
  hidHide: z.boolean().default(false),
  startWithWindows: z.boolean().default(false),
  startMinimized: z.boolean().default(false),
  theme: z.enum(['dark', 'light']).default('dark'),
  updates: z.boolean().default(false),
});
export type Settings = z.infer<typeof SettingsSchema>;

export function defaultSettings(): Settings {
  return SettingsSchema.parse({ schemaVersion: 1 });
}
