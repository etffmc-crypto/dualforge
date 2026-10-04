import { describe, expect, it } from 'vitest';
import { SettingsSchema, defaultSettings, EngineCommandSchema } from '../src/index.js';

describe('settings', () => {
  it('defaults', () => {
    expect(defaultSettings()).toMatchObject({
      schemaVersion: 1,
      activeProfile: 'p1',
      hasRumble: false,
      theme: 'dark',
      autoSwitch: [],
    });
  });
  it('rejects bad theme', () => {
    expect(SettingsSchema.safeParse({ schemaVersion: 1, theme: 'x' }).success).toBe(false);
  });
  it('caps auto-switch rules at 32 and exe names at 64 characters', () => {
    const rule = (exe: string) => ({ exe, profileId: 'p2' });
    const ok = (autoSwitch: unknown) =>
      SettingsSchema.safeParse({ schemaVersion: 1, autoSwitch }).success;
    expect(ok(Array.from({ length: 32 }, (_, i) => rule(`g${i}.exe`)))).toBe(true);
    expect(ok(Array.from({ length: 33 }, (_, i) => rule(`g${i}.exe`)))).toBe(false);
    expect(ok([rule(`${'a'.repeat(60)}.exe`)])).toBe(true);
    expect(ok([rule(`${'a'.repeat(61)}.exe`)])).toBe(false);
  });
  it('ipc accepts uiFocused and setSettings', () => {
    expect(EngineCommandSchema.safeParse({ type: 'uiFocused', focused: true }).success).toBe(true);
    expect(
      EngineCommandSchema.safeParse({ type: 'setSettings', settings: defaultSettings() }).success,
    ).toBe(true);
  });
});
