import { describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Settings } from '@dualforge/shared';
import { createSettingsHooks } from '../src/main/settings-hooks.js';

function rig(enable: { ok: boolean; code?: string } = { ok: true }, login: () => void = () => undefined) {
  let stored: Settings = defaultSettings();
  const sent: unknown[] = [];
  const log = { error: vi.fn() };
  const hidhide = { enable: vi.fn(async () => enable), disable: vi.fn(async () => ({ ok: true })) };
  const applyLoginItem = vi.fn(login);
  const refreshHealth = vi.fn();
  const hook = createSettingsHooks({
    hidhide, settingsStore: { set: (p) => (stored = { ...stored, ...p }) }, engine: { send: (c) => sent.push(c) }, applyLoginItem, log, refreshHealth,
  });
  const run = (patch: Partial<Settings>) => { const prev = stored; stored = { ...stored, ...patch }; return hook(prev, stored); };
  return { run, hidhide, applyLoginItem, sent, log, refreshHealth, get: () => stored };
}

describe('settings hooks', () => {
  it('a failed HidHide enable persists hidHide:false, tells the engine, and rejects with the code', async () => {
    const r = rig({ ok: false, code: 'E_HIDHIDE_NO_DEVICE' });
    await expect(r.run({ hidHide: true })).rejects.toThrow('E_HIDHIDE_NO_DEVICE');
    expect(r.get().hidHide).toBe(false);
    expect(r.sent).toEqual([{ type: 'setSettings', settings: expect.objectContaining({ hidHide: false }) }]);
    expect(r.refreshHealth).toHaveBeenCalled();
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
    const r = rig({ ok: true }, () => { throw new Error('registry'); });
    await expect(r.run({ startWithWindows: true, hidHide: true })).rejects.toThrow('E_STARTUP_LOGIN_ITEM');
    expect(r.hidhide.enable).toHaveBeenCalled();
    expect(r.get()).toMatchObject({ startWithWindows: true, hidHide: true });
    expect(r.log.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_STARTUP_LOGIN_ITEM' }));
  });
  it('does nothing for unrelated changes', async () => {
    const r = rig();
    await r.run({ theme: 'light' });
    expect(r.hidhide.enable).not.toHaveBeenCalled();
    expect(r.applyLoginItem).not.toHaveBeenCalled();
  });
});
