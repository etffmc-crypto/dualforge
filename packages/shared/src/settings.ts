import { z } from 'zod';
import { DS_BUTTONS } from './dualsense.js';
import { ProfileIdSchema } from './profile.js';

export const MAX_AUTO_SWITCH_RULES = 32;
export const MAX_EXE_LENGTH = 64;

/** On-pad turbo: hold `modeButton` + press a button to cycle its turbo; double-tap `modeButton` clears all turbo. */
export const TurboSettingsSchema = z.object({
  /** null disables the on-pad combo (the button keeps its normal mapping). */
  modeButton: z.enum(DS_BUTTONS).nullable().default('touchpad'),
  /** The lightbar pulses red while any button has turbo set. */
  lightbarPulse: z.boolean().default(true),
  onPadAssign: z.boolean().default(true),
});
export type TurboSettings = z.infer<typeof TurboSettingsSchema>;

export const SettingsSchema = z.object({
  schemaVersion: z.literal(1),
  activeProfile: ProfileIdSchema.default('p1'),
  /** Per-game rules: while `exe` (case-insensitive basename) is in front, the engine runs `profileId`. */
  autoSwitch: z
    .array(z.object({ exe: z.string().min(1).max(MAX_EXE_LENGTH), profileId: ProfileIdSchema }))
    .max(MAX_AUTO_SWITCH_RULES)
    .default([]),
  hasRumble: z.boolean().default(false),
  hidHide: z.boolean().default(false),
  startWithWindows: z.boolean().default(false),
  startMinimized: z.boolean().default(false),
  /** Close button hides the window to the tray instead of quitting (Quit from the tray menu really quits). */
  closeToTray: z.boolean().default(true),
  theme: z.enum(['dark', 'light']).default('dark'),
  updates: z.boolean().default(false),
  turbo: TurboSettingsSchema.default({}),
});
export type Settings = z.infer<typeof SettingsSchema>;

export function defaultSettings(): Settings {
  return SettingsSchema.parse({ schemaVersion: 1 });
}
