import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultProfile, type EngineCommand } from '@dualforge/shared';
import { createProfileStore } from '../src/main/profile-store.js';
import { createSettingsStore } from '../src/main/settings-store.js';
import { nodeIo, type FileIo } from '../src/main/json-file.js';
import { registerIpc, type DialogLike } from '../src/main/register-ipc.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'df-ipc-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function rig(io: FileIo = nodeIo, processes: () => Promise<unknown> = async () => ['game.exe'], extra: Partial<Parameters<typeof registerIpc>[0]> = {}) {
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
    dialog, store: createProfileStore(dir, log, io), settings: createSettingsStore(dir, log),
    engine: { send: (c) => sent.push(c) }, notifyActive: (id) => active.push(id), log,
    processes: processes as () => Promise<string[]>, ...extra,
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
  it('profiles:set pushes to the engine even when the disk write fails', () => {
    vi.useFakeTimers();
    const { call, sent, api, log } = rig({ ...nodeIo, renameSync() { throw new Error('disk'); } });
    api.applyProfile('p1'); sent.length = 0;
    expect(call('profiles:set', defaultProfile('p1', 'Live'))).toBe(true);
    expect(sent).toHaveLength(1);
    expect(() => vi.advanceTimersByTime(250)).not.toThrow();
    expect(log.error.mock.calls.some((c) => (c[0] as { code: string }).code === 'E_PROFILE_WRITE')).toBe(true);
    vi.useRealTimers();
  });
  it('profiles:current reports the engine profile and how it was selected; legacy profile:get/set follow it', () => {
    const { call, sent, api } = rig();
    expect(call('profiles:current')).toEqual({ id: 'p1', source: 'manual' });
    call('profiles:activate', 'p2');
    expect(call('profiles:current')).toEqual({ id: 'p2', source: 'manual' });
    api.applyProfile('p3', 'auto');                                   // auto-switch: settings.activeProfile stays p2
    expect(call('profiles:current')).toEqual({ id: 'p3', source: 'auto' });
    expect((call('settings:get') as { activeProfile: string }).activeProfile).toBe('p2');
    const cur = call('profile:get') as { id: string };
    expect(cur.id).toBe('p3');
    sent.length = 0;
    call('profile:set', { ...(cur as object), name: 'Edited live' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'setProfile', profile: { id: 'p3', name: 'Edited live' } });
  });
  it('profiles:duplicate into the running slot pushes setProfile', () => {
    const { call, sent, api } = rig();
    call('profiles:set', defaultProfile('p1', 'Src'));
    api.applyProfile('p2'); sent.length = 0;
    call('profiles:duplicate', 'p1', 'p2');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'setProfile', profile: { id: 'p2', name: 'Src copy' } });
  });
});

describe('system IPC', () => {
  it('system:processes returns the running exe names', async () => {
    const { call } = rig(nodeIo, async () => ['cs2.exe', 'eldenring.exe']);
    expect(await call('system:processes')).toEqual(['cs2.exe', 'eldenring.exe']);
  });
  it('system:processes rejects a malformed listing and reports E_PROCESSES', async () => {
    const { call, log } = rig(nodeIo, async () => ['ok.exe', 42]);
    await expect(call('system:processes')).rejects.toThrow('E_PROCESSES');
    const failing = rig(nodeIo, async () => { throw new Error('tasklist missing'); });
    await expect(failing.call('system:processes')).rejects.toThrow('E_PROCESSES');
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_PROCESSES' }));
    expect(failing.log.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_PROCESSES', msg: 'tasklist missing' }));
  });
  it('settings:set rejects a 33rd auto-switch rule and an over-long exe', () => {
    const { call } = rig();
    const rules = Array.from({ length: 33 }, (_, i) => ({ exe: `g${i}.exe`, profileId: 'p2' }));
    expect(() => call('settings:set', { autoSwitch: rules })).toThrow('E_SETTINGS_SCHEMA');
    expect(() => call('settings:set', { autoSwitch: [{ exe: `${'x'.repeat(61)}.exe`, profileId: 'p2' }] })).toThrow('E_SETTINGS_SCHEMA');
    expect(call('settings:set', { autoSwitch: rules.slice(0, 32) })).toMatchObject({ autoSwitch: rules.slice(0, 32) });
  });
});

describe('engine IPC', () => {
  it('engine:runMacro validates the id and forwards a runMacro command', () => {
    const { call, sent } = rig();
    call('engine:runMacro', 'm-1');
    expect(sent.at(-1)).toEqual({ type: 'runMacro', id: 'm-1' });
    const n = sent.length;
    expect(() => call('engine:runMacro', '')).toThrow();
    expect(() => call('engine:runMacro', { id: 'm-1' })).toThrow();
    expect(() => call('engine:runMacro', 'x'.repeat(65))).toThrow();
    expect(sent).toHaveLength(n);
  });
  it('engine:testRumble validates levels and duration and forwards a testRumble command', () => {
    const { call, sent } = rig();
    call('engine:testRumble', { left: 0.6, right: 0, ms: 500 });
    expect(sent.at(-1)).toEqual({ type: 'testRumble', left: 0.6, right: 0, ms: 500 });
    const n = sent.length;
    expect(() => call('engine:testRumble', { left: 1.5, right: 0, ms: 500 })).toThrow();
    expect(() => call('engine:testRumble', { left: 0.5, right: 0, ms: 10_000 })).toThrow();
    expect(() => call('engine:testRumble', { left: 0.5, right: 0, ms: 500, extra: 1 })).toThrow();
    expect(() => call('engine:testRumble', 'loud')).toThrow();
    expect(sent).toHaveLength(n);
  });
});

describe('settings change hook', () => {
  it('runs after settings:set with the previous and next settings, and the reply waits for it', async () => {
    const seen: [boolean, boolean][] = [];
    const { call } = rig(nodeIo, undefined, { onSettingsChanged: async (p, n) => { await Promise.resolve(); seen.push([p.hidHide, n.hidHide]); } });
    const next = await (call('settings:set', { hidHide: true }) as Promise<{ hidHide: boolean }>);
    expect(next.hidHide).toBe(true);
    expect(seen).toEqual([[false, true]]);
  });
  it('a rejecting hook rejects the settings:set call', async () => {
    const { call } = rig(nodeIo, undefined, { onSettingsChanged: async () => { throw new Error('E_HIDHIDE_CLI'); } });
    await expect(call('settings:set', { hidHide: true }) as Promise<unknown>).rejects.toThrow('E_HIDHIDE_CLI');
  });
});

describe('profiles changed hook', () => {
  it('fires for rename, duplicate, reset, save, import-code and activate', async () => {
    const changed = vi.fn();
    const { call } = rig(nodeIo, undefined, { onProfilesChanged: changed });
    call('profiles:rename', 'p2', 'Racing');
    expect(changed).toHaveBeenCalledTimes(1);
    call('profiles:duplicate', 'p2', 'p3');
    call('profiles:reset', 'p3');
    call('profiles:set', defaultProfile('p1', 'Mine'));
    const code = call('profiles:shareCode', 'p1') as string;
    call('profiles:importShareCode', code, 'p4');
    call('profiles:activate', 'p2');
    expect(changed.mock.calls.length).toBeGreaterThanOrEqual(6);
  });
});
