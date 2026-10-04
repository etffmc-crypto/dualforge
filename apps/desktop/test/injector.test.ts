import { describe, expect, it, vi } from 'vitest';
import { createInjector, type SendInputAddon } from '../src/main/injector.js';
import { VK, VK_NAMES } from '@dualforge/shared';

function fakeAddon(): SendInputAddon & { [K in keyof SendInputAddon]: ReturnType<typeof vi.fn> } {
  return {
    sendKey: vi.fn(),
    sendMouseButton: vi.fn(),
    sendMouseMove: vi.fn(),
    foregroundProcessName: vi.fn(() => 'cod.exe'),
  } as never;
}

describe('injector', () => {
  it('maps VK names to codes', () => {
    const a = fakeAddon(),
      log = vi.fn();
    const inj = createInjector(log, () => a);
    expect(inj.available).toBe(true);
    inj.key('VK_SPACE', true);
    expect(a.sendKey).toHaveBeenCalledWith(0x20, true);
    inj.mouse('middle', false);
    expect(a.sendMouseButton).toHaveBeenCalledWith(2, false);
    inj.move(3, -4);
    expect(a.sendMouseMove).toHaveBeenCalledWith(3, -4);
    inj.move(0, 0);
    expect(a.sendMouseMove).toHaveBeenCalledTimes(1);
    expect(inj.foreground()).toBe('cod.exe');
  });
  it('logs E_INJECT_KEY once for an unknown key and does not call the addon', () => {
    const a = fakeAddon(),
      log = vi.fn();
    const inj = createInjector(log, () => a);
    inj.key('VK_NOPE', true);
    inj.key('VK_NOPE', false);
    expect(a.sendKey).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toBe('E_INJECT_KEY');
  });
  it('is a no-op and logs E_INJECT_LOAD when the addon is missing', () => {
    const log = vi.fn();
    const inj = createInjector(log, () => {
      throw new Error('Cannot find module');
    });
    expect(inj.available).toBe(false);
    expect(log).toHaveBeenCalledWith('E_INJECT_LOAD', 'Cannot find module');
    inj.key('VK_SPACE', true);
    inj.mouse('left', true);
    inj.move(1, 1);
    expect(inj.foreground()).toBe('');
    expect(inj.foregroundElevated()).toBeNull();
  });
  it('foregroundElevated passes the addon answer through and degrades to null', () => {
    const a = fakeAddon();
    (a as { foregroundElevated?: unknown }).foregroundElevated = vi.fn(() => true);
    expect(createInjector(vi.fn(), () => a).foregroundElevated()).toBe(true);
    (a as { foregroundElevated?: unknown }).foregroundElevated = vi.fn(() => {
      throw new Error('x');
    });
    expect(createInjector(vi.fn(), () => a).foregroundElevated()).toBeNull();
    expect(createInjector(vi.fn(), () => fakeAddon()).foregroundElevated()).toBeNull(); // old addon without the export
  });
});

describe('VK table', () => {
  it('has the expected breadth and sorted names', () => {
    expect(VK_NAMES.length).toBeGreaterThanOrEqual(110);
    expect(VK_NAMES).toEqual([...VK_NAMES].sort());
    expect(VK.VK_A).toBe(0x41);
    expect(VK.VK_F12).toBe(0x7b);
    expect(VK.VK_NUMPAD0).toBe(0x60);
  });
});

describe('injector key lookup', () => {
  it('treats prototype property names as unknown keys', () => {
    const a = fakeAddon(),
      log = vi.fn();
    const inj = createInjector(log, () => a);
    inj.key('constructor', true);
    expect(a.sendKey).not.toHaveBeenCalled();
    expect(log.mock.calls[0]![0]).toBe('E_INJECT_KEY');
  });
});
