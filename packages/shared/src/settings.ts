import { z } from 'zod';
import { ProfileIdSchema } from './profile.js';

export const SettingsSchema = z.object({
  schemaVersion: z.literal(1),
  activeProfile: ProfileIdSchema.default('p1'),
  autoSwitch: z.array(z.object({ exe: z.string().min(1), profileId: ProfileIdSchema })).default([]),
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
