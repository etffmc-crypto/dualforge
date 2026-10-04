import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@dualforge/shared';
import { createSettingsStore } from '../src/main/settings-store.js';

let dir: string;
const log = { error: vi.fn(), warn: vi.fn() };
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'df-set-')); log.error.mockClear(); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('settings store', () => {
  it('defaults, then merges patches and persists', () => {
    const s = createSettingsStore(dir, log);
    expect(s.get()).toEqual(defaultSettings());
    const n = s.set({ hasRumble: true });
    expect(n.hasRumble).toBe(true); expect(n.theme).toBe('dark');
    s.set({ activeProfile: 'p3' });
    expect(createSettingsStore(dir, log).get()).toMatchObject({ hasRumble: true, activeProfile: 'p3' });
  });
  it('rejects an invalid patch without changing state', () => {
    const s = createSettingsStore(dir, log);
    expect(() => s.set({ theme: 'neon' as never })).toThrow();
    expect(s.get().theme).toBe('dark');
  });
  it('quarantines a corrupt settings file and returns defaults', () => {
    writeFileSync(join(dir, 'settings.json'), 'garbage');
    const s = createSettingsStore(dir, log);
    expect(s.get()).toEqual(defaultSettings());
    expect(existsSync(join(dir, 'settings.json'))).toBe(false);
    expect(readdirSync(join(dir, 'corrupt'))).toHaveLength(1);
    expect((log.error.mock.calls[0]![0] as { code: string }).code).toBe('E_SETTINGS_SCHEMA');
  });
  it('quarantines a persisted unknown profile id', () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ schemaVersion: 1, activeProfile: 'zzz' }));
    const s = createSettingsStore(dir, log);
    expect(s.get().activeProfile).toBe('p1');
    expect(readdirSync(join(dir, 'corrupt'))).toHaveLength(1);
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ schemaVersion: 1, autoSwitch: [{ exe: 'a.exe', profileId: '../x' }] }));
    expect(createSettingsStore(dir, log).get().autoSwitch).toEqual([]);
  });
});
