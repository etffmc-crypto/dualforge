import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultProfile,
  defaultSettings,
  type EngineCommand,
  type Entitlements,
  type Profile,
} from '@dualforge/shared';
import { collectEntries, redactLicense } from '../../src/main/bundle.js';
import { createGameWatcher } from '../../src/main/game-watcher.js';
import { createEngineGate } from '../../src/main/licensing/gate.js';
import { registerLicenseIpc } from '../../src/main/licensing/ipc.js';
import { createProfileStore } from '../../src/main/profile-store.js';
import { registerIpc } from '../../src/main/register-ipc.js';
import { createSettingsStore } from '../../src/main/settings-store.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'df-gate-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const FREE: Entitlements = { tier: 'free', enforced: true };
const PRO: Entitlements = { tier: 'pro', enforced: true };
const DORMANT: Entitlements = { tier: 'free', enforced: false };

function proProfile(id = 'p1'): Profile {
  const p = defaultProfile(id, 'Loaded');
  p.mappings.cross = {
    targets: [{ type: 'key', code: 'VK_SPACE' }],
    turbo: { mode: 'hold', hz: 12 },
    continuous: false,
  };
  p.triggers.left.effect = { mode: 'resistance', start: 2, force: 6 };
  p.gyro = { ...p.gyro, output: 'mouse' };
  return p;
}

function rig(ent: { e: Entitlements }) {
  const log = { error: vi.fn(), warn: vi.fn() };
  const handlers = new Map<string, (...a: unknown[]) => unknown>();
  const sent: EngineCommand[] = [];
  const store = createProfileStore(dir, log);
  const settings = createSettingsStore(dir, log);
  const gate = createEngineGate({ send: (c) => sent.push(c) }, () => ent.e);
  const api = registerIpc({
    ipc: { handle: (ch, fn) => handlers.set(ch, (...a) => fn({}, ...a)) },
    dialog: {
      showSaveDialog: async () => ({ canceled: true }),
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    },
    store,
    settings,
    engine: gate,
    license: { entitlements: () => ent.e },
    notifyActive: () => undefined,
    log,
    processes: async () => [],
  });
  const call = (ch: string, ...a: unknown[]) => handlers.get(ch)!(...a);
  return { call, sent, api, gate, store, settings, log };
}

describe('engine gate', () => {
  it('on Free the engine gets Pro outputs paused and the turbo combo off; the saved profile keeps them', () => {
    const ent = { e: FREE };
    const { call, sent, api, store } = rig(ent);
    call('profiles:set', proProfile());
    api.applyProfile('p1');
    const prof = sent.filter((c) => c.type === 'setProfile').at(-1) as Extract<
      EngineCommand,
      { type: 'setProfile' }
    >;
    expect(prof.profile.mappings.cross!.targets).toEqual([{ type: 'none' }]);
    expect(prof.profile.mappings.cross!.turbo.mode).toBe('off');
    expect(prof.profile.triggers.left.effect).toEqual({ mode: 'off' });
    expect(prof.profile.gyro.output).toBe('off');
    store.flush();
    const saved = JSON.parse(readFileSync(join(dir, 'profiles', 'p1.json'), 'utf8')) as Profile;
    expect(saved.mappings.cross!.targets).toEqual([{ type: 'key', code: 'VK_SPACE' }]);
    expect(saved.gyro.output).toBe('mouse');
    call('settings:set', { hasRumble: true });
    const set = sent.filter((c) => c.type === 'setSettings').at(-1) as Extract<
      EngineCommand,
      { type: 'setSettings' }
    >;
    expect(set.settings.turbo.modeButton).toBeNull();
    expect((call('settings:get') as { turbo: { modeButton: string } }).turbo.modeButton).toBe(
      'touchpad',
    );
  });
  it('a tier change re-sends the saved profile and settings gated for the new tier', () => {
    const ent = { e: FREE };
    const { call, sent, api, gate } = rig(ent);
    call('profiles:set', proProfile());
    api.applyProfile('p1');
    call('settings:set', { hasRumble: true });
    sent.length = 0;
    ent.e = PRO;
    gate.refresh();
    expect(sent.map((c) => c.type)).toEqual(['setSettings', 'setProfile']);
    const prof = sent[1] as Extract<EngineCommand, { type: 'setProfile' }>;
    expect(prof.profile.mappings.cross!.targets).toEqual([{ type: 'key', code: 'VK_SPACE' }]);
    expect(
      (sent[0] as Extract<EngineCommand, { type: 'setSettings' }>).settings.turbo.modeButton,
    ).toBe('touchpad');
  });
  it('dormant and Pro pass everything through unchanged', () => {
    for (const e of [DORMANT, PRO]) {
      const sent: EngineCommand[] = [];
      const gate = createEngineGate({ send: (c) => sent.push(c) }, () => e);
      const p = proProfile();
      gate.send({ type: 'setProfile', profile: p });
      gate.send({ type: 'setSettings', settings: defaultSettings() });
      expect((sent[0] as { profile: Profile }).profile).toBe(p);
      expect(sent[1]).toEqual({ type: 'setSettings', settings: defaultSettings() });
    }
  });
});

describe('IPC refusals on Free', () => {
  it('slots 3 and 4: save, switch, rename, reset, duplicate into and share-import into are refused', () => {
    const ent = { e: PRO };
    const { call, store } = rig(ent);
    call('profiles:set', defaultProfile('p3', 'Three'));
    store.flush();
    ent.e = FREE;
    const pro = /E_LICENSE_PRO: Profile slots 3 and 4/;
    expect(() => call('profiles:set', defaultProfile('p3', 'Changed'))).toThrow(pro);
    expect(() => call('profile:set', defaultProfile('p4', 'Changed'))).toThrow(pro);
    expect(() => call('profiles:activate', 'p3')).toThrow(pro);
    expect(() => call('profiles:rename', 'p3', 'New')).toThrow(pro);
    expect(() => call('profiles:reset', 'p4')).toThrow(pro);
    expect(() => call('profiles:duplicate', 'p1', 'p4')).toThrow(pro);
    expect(() => call('profiles:importShareCode', 'DUALFORGE:x', 'p3')).toThrow(pro);
    expect(store.get('p3').name).toBe('Three'); // content stays on disk
    expect(call('profiles:activate', 'p2')).toMatchObject({ id: 'p2' }); // free slots work
    expect(() => call('profiles:set', defaultProfile('p1', 'One'))).not.toThrow();
  });
  it('share-code export is refused, import into slots 1 and 2 stays free', () => {
    const ent = { e: PRO };
    const { call } = rig(ent);
    const code = call('profiles:shareCode', 'p1') as string;
    ent.e = FREE;
    expect(() => call('profiles:shareCode', 'p1')).toThrow(/E_LICENSE_PRO: Share-code export/);
    expect(call('profiles:importShareCode', code, 'p2')).toMatchObject({ id: 'p2' });
  });
  it('a macro play-test is refused on Free', () => {
    const { call, sent } = rig({ e: FREE });
    expect(() => call('engine:runMacro', 'm1')).toThrow(/E_LICENSE_PRO: Macros/);
    expect(sent.some((c) => c.type === 'runMacro')).toBe(false);
  });
  it('the active slot 3 stays running when Pro ends, edits refused', () => {
    const ent = { e: PRO };
    const { call, api } = rig(ent);
    call('profiles:activate', 'p3');
    ent.e = FREE;
    expect(api.currentEngineProfile()).toBe('p3');
    expect(() => call('profile:set', defaultProfile('p3', 'Edit'))).toThrow('E_LICENSE_PRO');
  });
  it('dormant (no license dependency) allows everything, as in 0.3.x', () => {
    const { call } = rig({ e: DORMANT });
    expect(() => call('profiles:set', defaultProfile('p4', 'Four'))).not.toThrow();
    expect(() => call('profiles:shareCode', 'p4')).not.toThrow();
    expect(() => call('profiles:activate', 'p4')).not.toThrow();
  });
});

describe('settings:set and the license block', () => {
  it('the renderer cannot write the license block; the rest of the patch applies', () => {
    const { call, settings, log } = rig({ e: FREE });
    settings.setLicense({
      key: 'REAL-KEY-1234',
      instanceId: 'i',
      status: 'active',
      variant: 'monthly',
      expiresAt: '',
      lastCheck: '2026-10-16T00:00:00Z',
      founderKey: '',
    });
    const next = call('settings:set', {
      theme: 'light',
      license: { key: 'EVIL', status: 'active', founderKey: 'DFKEY1.x.y' },
    }) as Record<string, unknown>;
    expect(next.theme).toBe('light');
    expect(next).not.toHaveProperty('license');
    expect(settings.getLicense()).toMatchObject({ key: 'REAL-KEY-1234', founderKey: '' });
    const file = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as {
      license: { key: string };
      theme: string;
    };
    expect(file).toMatchObject({ theme: 'light', license: { key: 'REAL-KEY-1234' } });
    expect(log.warn).toHaveBeenCalledWith({ code: 'LICENSE_PATCH_IGNORED' });
    expect(call('settings:get')).not.toHaveProperty('license');
  });
  it('the license block survives settings writes and a reload, and an invalid block is dropped', () => {
    const log = { error: vi.fn(), warn: vi.fn() };
    const s = createSettingsStore(dir, log);
    s.setLicense({ ...s.getLicense(), key: 'ABCDEFGH1234', status: 'active' });
    s.set({ hasRumble: true });
    expect(createSettingsStore(dir, log).getLicense()).toMatchObject({ key: 'ABCDEFGH1234' });
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ schemaVersion: 1, theme: 'light', license: { status: 'pro' } }),
    );
    const again = createSettingsStore(dir, log);
    expect(again.get().theme).toBe('light');
    expect(again.getLicense().status).toBe('');
  });
});

describe('license IPC', () => {
  it('routes the Plan card channels and opens only the baked links', async () => {
    const handlers = new Map<string, (...a: unknown[]) => unknown>();
    const view = { enforced: true } as never;
    const service = {
      view: vi.fn(() => view),
      activate: vi.fn(async () => view),
      check: vi.fn(async () => view),
      remove: vi.fn(async () => view),
    };
    const openExternal = vi.fn();
    registerLicenseIpc({
      ipc: { handle: (ch, fn) => handlers.set(ch, (...a) => fn({}, ...a)) },
      service,
      checkoutUrl: 'https://example.com/buy',
      portalUrl: '',
      openExternal,
    });
    const call = (ch: string, ...a: unknown[]) => handlers.get(ch)!(...a);
    await call('license:activate', 'KEY');
    await call('license:activate', 'x'.repeat(5000));
    await call('license:activate', { not: 'text' });
    expect(service.activate.mock.calls).toEqual([['KEY'], [''], ['']]);
    expect(await call('license:openCheckout', 'https://evil.example')).toBe(true);
    expect(openExternal).toHaveBeenCalledWith('https://example.com/buy');
    expect(await call('license:openPortal')).toBe(false);
    await call('license:check');
    await call('license:remove');
    expect(service.check).toHaveBeenCalled();
    expect(service.remove).toHaveBeenCalled();
  });
});

describe('game watcher on Free', () => {
  it('ignores the auto-switch rules and returns to the active profile', () => {
    vi.useFakeTimers();
    try {
      let fg = 'game.exe';
      let allowed = true;
      const switched: string[] = [];
      const settings = {
        ...defaultSettings(),
        autoSwitch: [{ exe: 'game.exe', profileId: 'p2' as const }],
      };
      const w = createGameWatcher({
        foreground: () => fg,
        settings: () => settings,
        onSwitch: (id) => switched.push(id),
        intervalMs: 10,
        ignore: [],
        rulesEnabled: () => allowed,
      });
      w.start();
      vi.advanceTimersByTime(10);
      expect(switched).toEqual(['p2']);
      allowed = false;
      vi.advanceTimersByTime(10);
      expect(switched).toEqual(['p2', 'p1']);
      fg = 'other.exe';
      vi.advanceTimersByTime(10);
      fg = 'game.exe';
      vi.advanceTimersByTime(30);
      expect(switched).toEqual(['p2', 'p1']);
      w.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('diagnostics bundle', () => {
  it('settings.json goes in with the key reduced to its last 4 characters', () => {
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({
        schemaVersion: 1,
        theme: 'dark',
        license: { key: 'SECRET-KEY-9876', status: 'active', founderKey: 'DFKEY1.a.b' },
      }),
    );
    const entries = collectEntries({
      logDir: join(dir, 'logs'),
      crashDir: join(dir, 'crashes'),
      dataDir: dir,
      now: Date.now(),
      health: null,
      system: {},
    });
    const s = entries.find((e) => e.name === 'settings.json')!;
    expect(s.path).toBeUndefined();
    expect(s.data).not.toContain('SECRET-KEY');
    expect(s.data).not.toContain('DFKEY1');
    expect(JSON.parse(s.data!)).toMatchObject({
      theme: 'dark',
      license: { keyHint: '9876', status: 'active', founderKey: 'present' },
    });
    expect(redactLicense('{"schemaVersion":1}')).toBeNull();
    expect(redactLicense('{')).toBeNull();
  });
});
