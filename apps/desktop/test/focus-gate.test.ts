import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFocusGate } from '../src/main/focus-gate.js';
import { createGameWatcher } from '../src/main/game-watcher.js';
import { defaultSettings } from '@dualforge/shared';

describe('focus gate', () => {
  it('window focus is the fast path; own-foreground keeps it closed after a blur', () => {
    const sent: boolean[] = [];
    const g = createFocusGate((f) => sent.push(f));
    g.windowFocus(true);
    g.ownForeground(true);
    g.windowFocus(false); // native dialog of ours took focus: still own foreground
    expect(g.isUiFocused()).toBe(true);
    g.ownForeground(false); // a game came to the front
    expect(g.isUiFocused()).toBe(false);
    expect(sent).toEqual([true, false]); // only changes are sent
  });
  it('resend repeats the current value', () => {
    const sent: boolean[] = [];
    const g = createFocusGate((f) => sent.push(f));
    g.windowFocus(false);
    g.resend();
    expect(sent).toEqual([false, false]);
  });
});

describe('watcher own-foreground sampling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  function rig(pids: (number | null)[], names: string[]) {
    let i = 0;
    const own: boolean[] = [];
    const w = createGameWatcher({
      foreground: () => names[Math.min(i, names.length - 1)]!,
      foregroundPid: () => pids[Math.min(i++, pids.length - 1)] ?? null,
      ownPid: 4242,
      settings: () => defaultSettings(),
      onSwitch: vi.fn(),
      onOwnForeground: (o) => own.push(o),
    });
    return { w, own };
  }
  it('is own-foreground when the foreground pid is this process, even for a dialog with another exe name', () => {
    const { w, own } = rig([4242, 999], ['comdlg.exe', 'game.exe']);
    w.start();
    vi.advanceTimersByTime(2000);
    expect(w.isOwnForeground()).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(w.isOwnForeground()).toBe(false);
    expect(own).toEqual([true, false]);
    w.stop();
  });
  it('falls back to the exe name when the addon has no pid export', () => {
    const { w } = rig([null], ['electron.exe']);
    w.start();
    vi.advanceTimersByTime(2000);
    expect(w.isOwnForeground()).toBe(true);
    w.stop();
  });
  it('sampleOwnForeground takes an immediate sample', () => {
    const { w, own } = rig([4242], ['x.exe']);
    w.sampleOwnForeground();
    expect(own).toEqual([true]);
  });
});
