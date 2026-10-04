import { describe, expect, it, vi } from 'vitest';
import { buildTrayMenu, createTray } from '../src/main/tray.js';

const PROFILES = [{ id: 'p1', name: 'Shooter' }, { id: 'p2', name: 'Racing' }, { id: 'p3', name: 'Profile 3' }, { id: 'p4', name: 'Profile 4' }];
const actions = () => ({ show: vi.fn(), activate: vi.fn(), health: vi.fn(), quit: vi.fn() });

describe('tray menu', () => {
  it('has Show, a Profiles submenu with the active one checked, Health and Quit', () => {
    const a = actions();
    const m = buildTrayMenu({ profiles: PROFILES, activeId: 'p2', ...a });
    const labels = m.filter((i) => i.type !== 'separator').map((i) => i.label);
    expect(labels).toEqual(['Show DualForge', 'Profiles', 'Health', 'Quit']);
    const sub = m.find((i) => i.label === 'Profiles')!.submenu as { label: string; checked: boolean; type: string; click: () => void }[];
    expect(sub.map((i) => i.label)).toEqual(['Shooter', 'Racing', 'Profile 3', 'Profile 4']);
    expect(sub.map((i) => i.checked)).toEqual([false, true, false, false]);
    expect(sub.every((i) => i.type === 'radio')).toBe(true);
  });
  it('clicks call the actions', () => {
    const a = actions();
    const m = buildTrayMenu({ profiles: PROFILES, activeId: 'p1', ...a });
    const click = (label: string) => (m.find((i) => i.label === label)!.click as () => void)();
    click('Show DualForge'); click('Health'); click('Quit');
    expect([a.show, a.health, a.quit].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    (m.find((i) => i.label === 'Profiles')!.submenu as { click: () => void }[])[2]!.click();
    expect(a.activate).toHaveBeenCalledWith('p3');
  });
});

describe('createTray', () => {
  function fakes(empty = false) {
    const handlers: Record<string, () => void> = {};
    const tray = { setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn((e: string, f: () => void) => { handlers[e] = f; }), destroy: vi.fn() };
    const Tray = vi.fn(() => tray);
    const Menu = { buildFromTemplate: vi.fn((t: unknown) => ({ t })) };
    const nativeImage = { createFromPath: vi.fn(() => ({ isEmpty: () => empty })) };
    const log = { error: vi.fn() };
    return { handlers, tray, Tray, Menu, nativeImage, log };
  }
  it('creates the tray with a tooltip and refreshes the menu with the active profile', () => {
    const f = fakes();
    const a = actions();
    const t = createTray({ Tray: f.Tray as never, Menu: f.Menu as never, nativeImage: f.nativeImage as never, iconPath: 'x/tray.png', profiles: () => PROFILES, activeId: () => 'p3', log: f.log, ...a });
    expect(t.exists()).toBe(true);
    expect(f.tray.setToolTip).toHaveBeenCalledWith('DualForge');
    const tpl = (f.Menu.buildFromTemplate.mock.calls[0] as unknown as [{ label: string; submenu?: { checked: boolean }[] }[]])[0];
    expect(tpl.find((i) => i.label === 'Profiles')!.submenu!.map((i) => i.checked)).toEqual([false, false, true, false]);
    f.handlers['click']!();
    expect(a.show).toHaveBeenCalled();
    t.refresh();
    expect(f.Menu.buildFromTemplate).toHaveBeenCalledTimes(2);
  });
  it('no tray (and E_TRAY_ICON logged) when the icon cannot be loaded', () => {
    const f = fakes(true);
    const t = createTray({ Tray: f.Tray as never, Menu: f.Menu as never, nativeImage: f.nativeImage as never, iconPath: 'missing.png', profiles: () => PROFILES, activeId: () => 'p1', log: f.log, ...actions() });
    expect(t.exists()).toBe(false);
    expect(f.log.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_TRAY_ICON' }));
    expect(f.Tray).not.toHaveBeenCalled();
  });
});
