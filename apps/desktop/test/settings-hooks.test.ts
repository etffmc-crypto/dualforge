import { describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Settings } from '@dualforge/shared';
import { createSettingsHooks } from '../src/main/settings-hooks.js';
import { createHidHideQueue } from '../src/main/hidhide.js';

function rig(
  enable: { ok: boolean; code?: string; msg?: string } = { ok: true },
  login: () => void = () => undefined,
) {
  let stored: Settings = defaultSettings();
  const sent: unknown[] = [];
  const log = { error: vi.fn() };
  const hidhide = { enable: vi.fn(async () => enable), disable: vi.fn(async () => ({ ok: true })) };
  const applyLoginItem = vi.fn(login);
  const refreshHealth = vi.fn();
  const hook = createSettingsHooks({
    hidhide,
    settingsStore: { set: (p) => (stored = { ...stored, ...p }) },
    engine: { send: (c) => sent.push(c) },
    applyLoginItem,
    log,
    refreshHealth,
  });
  const run = (patch: Partial<Settings>) => {
    const prev = stored;
    stored = { ...stored, ...patch };
    return hook(prev, stored);
  };
  return { run, hidhide, applyLoginItem, sent, log, refreshHealth, get: () => stored };
}

describe('settings hooks', () => {
  it('a failed HidHide enable persists hidHide:false, tells the engine, and rejects with the code', async () => {
    const r = rig({ ok: false, code: 'E_HIDHIDE_NO_DEVICE' });
    await expect(r.run({ hidHide: true })).rejects.toThrow('E_HIDHIDE_NO_DEVICE');
    expect(r.get().hidHide).toBe(false);
    expect(r.sent).toEqual([
      { type: 'setSettings', settings: expect.objectContaining({ hidHide: false }) },
    ]);
    expect(r.refreshHealth).toHaveBeenCalled();
  });
  it('the rejection carries the code first, then why (the footer tells a timeout from a refusal by it)', async () => {
    const r = rig({
      ok: false,
      code: 'E_HIDHIDE_ELEVATION_DECLINED',
      msg: 'elevated HidHide call did not complete: powershell.exe timed out after 120000 ms',
    });
    await expect(r.run({ hidHide: true })).rejects.toThrow(
      /^E_HIDHIDE_ELEVATION_DECLINED: elevated HidHide call did not complete: .*timed out/,
    );
  });
  it('a successful enable and a disable leave the setting alone', async () => {
    const r = rig();
    await r.run({ hidHide: true });
    expect(r.get().hidHide).toBe(true);
    await r.run({ hidHide: false });
    expect(r.hidhide.disable).toHaveBeenCalled();
    expect(r.sent).toEqual([]);
  });
  it('a throwing login item is logged, does not block HidHide, and rejects E_STARTUP_LOGIN_ITEM afterwards', async () => {
    const r = rig({ ok: true }, () => {
      throw new Error('registry');
    });
    await expect(r.run({ startWithWindows: true, hidHide: true })).rejects.toThrow(
      'E_STARTUP_LOGIN_ITEM',
    );
    expect(r.hidhide.enable).toHaveBeenCalled();
    expect(r.get()).toMatchObject({ startWithWindows: true, hidHide: true });
    expect(r.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'E_STARTUP_LOGIN_ITEM' }),
    );
  });
  it('a throwing settings write while reverting becomes E_SETTINGS_WRITE (logged), not an uncoded error', async () => {
    const log = { error: vi.fn() };
    const hook = createSettingsHooks({
      hidhide: {
        enable: async () => ({ ok: false, code: 'E_HIDHIDE_NO_DEVICE' }),
        disable: async () => ({ ok: true }),
      },
      settingsStore: {
        set: () => {
          throw new Error('EPERM: settings.json');
        },
      },
      engine: { send: vi.fn() },
      applyLoginItem: vi.fn(),
      log,
    });
    const prev = defaultSettings();
    await expect(hook(prev, { ...prev, hidHide: true })).rejects.toThrow(/^E_SETTINGS_WRITE$/);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_SETTINGS_WRITE' }));
  });

  it('enable then disable queued: ends with cloak off and the setting false', async () => {
    let stored: Settings = defaultSettings();
    const cloak: string[] = [];
    const slow = (name: string) => async () => {
      await new Promise((r) => setTimeout(r, 5));
      cloak.push(name);
      return { ok: true };
    };
    const q = createHidHideQueue({
      hidhide: {
        enable: slow('on'),
        startup: slow('on'),
        disable: slow('off'),
        quitCloakOff: slow('off'),
      },
      desired: () => stored.hidHide,
      log: { info: vi.fn() },
    });
    const hook = createSettingsHooks({
      hidhide: q,
      settingsStore: { set: (p) => (stored = { ...stored, ...p }) },
      engine: { send: vi.fn() },
      applyLoginItem: vi.fn(),
      log: { error: vi.fn() },
    });
    const run = (patch: Partial<Settings>) => {
      const prev = stored;
      stored = { ...stored, ...patch };
      return hook(prev, stored);
    };
    await Promise.all([run({ hidHide: true }), run({ hidHide: false })]);
    expect(cloak.at(-1)).toBe('off');
    expect(stored.hidHide).toBe(false);
  });

  it('a failed disable keeps hidHide true and rejects with the code', async () => {
    const r = rig();
    await r.run({ hidHide: true });
    r.hidhide.disable.mockResolvedValueOnce({
      ok: false,
      code: 'E_HIDHIDE_ELEVATION_DECLINED',
    } as never);
    await expect(r.run({ hidHide: false })).rejects.toThrow('E_HIDHIDE_ELEVATION_DECLINED');
    expect(r.get().hidHide).toBe(true);
    expect(r.sent).toEqual([
      { type: 'setSettings', settings: expect.objectContaining({ hidHide: true }) },
    ]);
  });

  it('does nothing for unrelated changes', async () => {
    const r = rig();
    await r.run({ theme: 'light' });
    expect(r.hidhide.enable).not.toHaveBeenCalled();
    expect(r.applyLoginItem).not.toHaveBeenCalled();
  });
});
