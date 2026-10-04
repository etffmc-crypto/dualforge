import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultProfile, type EngineCommand } from '@dualforge/shared';
import { createProfileStore } from '../src/main/profile-store.js';
import { createSettingsStore } from '../src/main/settings-store.js';
import { registerIpc, type DialogLike } from '../src/main/register-ipc.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'df-ipc-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function rig() {
  const log = { error: vi.fn(), warn: vi.fn() };
  const handlers = new Map<string, (...a: unknown[]) => unknown>();
  const sent: EngineCommand[] = [];
  const active: string[] = [];
  const dialog: DialogLike = {
    showSaveDialog: async () => ({ canceled: true }),
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  };
  const api = registerIpc({
    ipc: { handle: (ch, fn) => handlers.set(ch, (...a) => fn({}, ...a)) },
    dialog, store: createProfileStore(dir, log), settings: createSettingsStore(dir, log),
    engine: { send: (c) => sent.push(c) }, notifyActive: (id) => active.push(id), log,
  });
  const call = (ch: string, ...a: unknown[]) => handlers.get(ch)!(...a);
  return { call, sent, active, api, log };
}

describe('profile / settings IPC', () => {
  it('rejects malformed input with zod before touching the stores', () => {
    const { call, log } = rig();
    expect(() => call('profiles:get', '../../etc/passwd')).toThrow();
    expect(() => call('profiles:set', { nope: true })).toThrow('E_PROFILE_SCHEMA');
    expect(() => call('profiles:rename', 'p1', '')).toThrow();
    expect(() => call('profiles:duplicate', 'p1', 'p9')).toThrow();
    expect(() => call('settings:set', { theme: 'neon' })).toThrow('E_SETTINGS_SCHEMA');
    expect(() => call('settings:set', { bogus: 1 })).toThrow('E_SETTINGS_SCHEMA');
    expect(() => call('settings:set', { activeProfile: 'x' })).toThrow();
    expect(log.error).toHaveBeenCalled();
  });
  it('activate persists the active profile and loads it into the engine', () => {
    const { call, sent, active } = rig();
    call('profiles:set', { ...defaultProfile('p3', 'Three') });
    call('profiles:activate', 'p3');
    expect((call('settings:get') as { activeProfile: string }).activeProfile).toBe('p3');
    expect(sent.at(-1)).toMatchObject({ type: 'setProfile', profile: { id: 'p3', name: 'Three' } });
    expect(active).toEqual(['p3']);
  });
  it('saving the running profile pushes it to the engine; other slots do not', () => {
    const { call, sent, api } = rig();
    api.applyProfile('p1'); sent.length = 0;
    call('profiles:set', defaultProfile('p2', 'Other'));
    expect(sent).toEqual([]);
    call('profiles:set', defaultProfile('p1', 'Mine'));
    expect(sent).toHaveLength(1);
  });
  it('settings:set merges, persists and forwards setSettings to the engine', () => {
    const { call, sent } = rig();
    const next = call('settings:set', { hasRumble: true }) as { hasRumble: boolean; theme: string };
    expect(next).toMatchObject({ hasRumble: true, theme: 'dark' });
    expect(sent.at(-1)).toMatchObject({ type: 'setSettings', settings: { hasRumble: true } });
  });
  it('share code round-trips through IPC into a slot', () => {
    const { call } = rig();
    call('profiles:set', { ...defaultProfile('p1', 'Shared') });
    const code = call('profiles:shareCode', 'p1') as string;
    const p = call('profiles:importShareCode', code, 'p4') as { id: string; name: string };
    expect(p).toMatchObject({ id: 'p4', name: 'Shared' });
    expect(() => call('profiles:importShareCode', 'DUALFORGE:@@@', 'p4')).toThrow('E_SHARE_CODE');
  });
});
