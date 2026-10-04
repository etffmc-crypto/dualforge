import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@dualforge/shared';
import { applyLoginItem, loginItemOptions, parseStartupArgs, shouldStartHidden, shouldHideOnClose, START_ARG } from '../src/main/startup.js';

describe('startup args', () => {
  it('detects --minimized anywhere in argv', () => {
    expect(parseStartupArgs(['electron.exe', 'app', '--minimized'])).toEqual({ minimized: true });
    expect(parseStartupArgs(['DualForge.exe'])).toEqual({ minimized: false });
    expect(parseStartupArgs(['DualForge.exe', '--minimized-not'])).toEqual({ minimized: false });
  });
  it('the window starts hidden for --minimized or settings.startMinimized', () => {
    const s = defaultSettings();
    expect(shouldStartHidden(['x'], s)).toBe(false);
    expect(shouldStartHidden(['x', START_ARG], s)).toBe(true);
    expect(shouldStartHidden(['x'], { ...s, startMinimized: true })).toBe(true);
  });
});

describe('login item', () => {
  it('mirrors startWithWindows and always passes --minimized', () => {
    expect(loginItemOptions({ ...defaultSettings(), startWithWindows: true })).toEqual({ openAtLogin: true, args: ['--minimized'] });
    expect(loginItemOptions(defaultSettings())).toEqual({ openAtLogin: false, args: ['--minimized'] });
  });
  it('applies through app.setLoginItemSettings in a packaged app', () => {
    const set = vi.fn();
    applyLoginItem({ isPackaged: true, setLoginItemSettings: set }, { ...defaultSettings(), startWithWindows: true }, { info: vi.fn() });
    expect(set).toHaveBeenCalledWith({ openAtLogin: true, args: ['--minimized'] });
  });
  it('leaves the registry alone in a dev run (it would register the bare Electron exe)', () => {
    const set = vi.fn();
    applyLoginItem({ isPackaged: false, setLoginItemSettings: set }, { ...defaultSettings(), startWithWindows: true }, { info: vi.fn() });
    expect(set).not.toHaveBeenCalled();
  });
});

describe('close to tray', () => {
  it('hides only when enabled, a tray exists and the app is not quitting', () => {
    expect(shouldHideOnClose({ closeToTray: true, hasTray: true, quitting: false })).toBe(true);
    expect(shouldHideOnClose({ closeToTray: false, hasTray: true, quitting: false })).toBe(false);
    expect(shouldHideOnClose({ closeToTray: true, hasTray: false, quitting: false })).toBe(false);
    expect(shouldHideOnClose({ closeToTray: true, hasTray: true, quitting: true })).toBe(false);
  });
});
