import { basename } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Settings } from '@dualforge/shared';
import { createGameWatcher } from '../src/main/game-watcher.js';

function rig(seq: string[], over: Partial<Settings> = {}, available = true) {
  let i = 0;
  const switched: string[] = [];
  const settings: Settings = {
    ...defaultSettings(),
    activeProfile: 'p1',
    autoSwitch: [{ exe: 'COD.exe', profileId: 'p2' }],
    ...over,
  };
  const w = createGameWatcher({
    foreground: () => seq[Math.min(i++, seq.length - 1)]!,
    settings: () => settings,
    onSwitch: (id) => switched.push(id),
    available,
  });
  return { w, switched, settings };
}

describe('game watcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a sticky sample of the last foreign foreground and its elevation, ignoring DualForge itself', () => {
    const seq = ['', 'game.exe', 'electron.exe', 'electron.exe'];
    const elev = [true, false, false, false];
    let i = 0;
    const w = createGameWatcher({
      foreground: () => seq[Math.min(i, seq.length - 1)]!,
      foregroundElevated: () => elev[Math.min(i++, elev.length - 1)] ?? null,
      settings: () => ({ ...defaultSettings() }),
      onSwitch: vi.fn(),
      now: () => 42,
    });
    expect(w.lastForeignForeground()).toBeNull();
    w.start();
    vi.advanceTimersByTime(2000); // '' : transient, no sample
    expect(w.lastForeignForeground()).toBeNull();
    i = 1;
    elev[1] = true;
    vi.advanceTimersByTime(2000); // game.exe elevated
    expect(w.lastForeignForeground()).toEqual({ name: 'game.exe', elevated: true, at: 42 });
    vi.advanceTimersByTime(4000); // DualForge in front: sample unchanged
    expect(w.lastForeignForeground()).toEqual({ name: 'game.exe', elevated: true, at: 42 });
    w.stop();
  });

  it('expires the sticky sample after 60 s of DualForge or empty foreground', () => {
    let fg = 'game.exe';
    const w = createGameWatcher({
      foreground: () => fg,
      foregroundElevated: () => true,
      settings: () => ({ ...defaultSettings() }),
      onSwitch: vi.fn(),
    });
    w.start();
    vi.advanceTimersByTime(2000);
    expect(w.lastForeignForeground()?.name).toBe('game.exe');
    fg = 'electron.exe';
    vi.advanceTimersByTime(2000 * 29);
    expect(w.lastForeignForeground()).not.toBeNull(); // 58 s: still held
    vi.advanceTimersByTime(2000 * 2);
    expect(w.lastForeignForeground()).toBeNull(); // 62 s
    fg = '';
    vi.advanceTimersByTime(2000);
    expect(w.lastForeignForeground()).toBeNull();
    w.stop();
  });

  it('switches once to the mapped profile (case-insensitive) and back when the game leaves the foreground', () => {
    const { w, switched } = rig([
      'explorer.exe',
      'cod.exe',
      'cod.exe',
      'cod.exe',
      'explorer.exe',
      'explorer.exe',
    ]);
    w.start();
    vi.advanceTimersByTime(2000 * 6);
    expect(switched).toEqual(['p2', 'p1']);
    w.stop();
  });
  it('does not switch when the rule already matches the active profile', () => {
    const { w, switched } = rig(['cod.exe', 'cod.exe', 'explorer.exe'], { activeProfile: 'p2' });
    w.start();
    vi.advanceTimersByTime(2000 * 3);
    expect(switched).toEqual([]);
    w.stop();
  });
  it('ignores empty foreground names (no flapping)', () => {
    const { w, switched } = rig(['cod.exe', '', '', 'cod.exe']);
    w.start();
    vi.advanceTimersByTime(2000 * 4);
    expect(switched).toEqual(['p2']);
    w.stop();
  });
  it('moves between two games directly and returns to the manual profile', () => {
    const { w, switched } = rig(['a.exe', 'b.exe', 'x.exe'], {
      autoSwitch: [
        { exe: 'a.exe', profileId: 'p2' },
        { exe: 'b.exe', profileId: 'p3' },
      ],
    });
    w.start();
    vi.advanceTimersByTime(2000 * 3);
    expect(switched).toEqual(['p2', 'p3', 'p1']);
    w.stop();
  });
  it('is a no-op when the injector is unavailable', () => {
    const { w, switched } = rig(['cod.exe'], {}, false);
    w.start();
    vi.advanceTimersByTime(10_000);
    expect(switched).toEqual([]);
  });
  it('stop() ends polling', () => {
    const { w, switched } = rig(['cod.exe']);
    w.start();
    w.stop();
    vi.advanceTimersByTime(10_000);
    expect(switched).toEqual([]);
  });
  it('a throwing onSwitch is logged E_AUTOSWITCH and does not kill the interval', () => {
    const log = vi.fn();
    let n = 0;
    const seq = ['cod.exe', 'x.exe', 'cod.exe'];
    const w = createGameWatcher({
      foreground: () => seq[n++ % 3]!,
      settings: () => ({ ...defaultSettings(), autoSwitch: [{ exe: 'cod.exe', profileId: 'p2' }] }),
      onSwitch: () => {
        throw new Error('boom');
      },
      log,
    });
    w.start();
    vi.advanceTimersByTime(2000 * 3);
    expect(log.mock.calls.map((c) => c[0])).toEqual([
      'E_AUTOSWITCH',
      'E_AUTOSWITCH',
      'E_AUTOSWITCH',
    ]);
    w.stop();
  });
  it('ignores its own executable like an empty name', () => {
    const self = basename(process.execPath).toUpperCase();
    const { w, switched } = rig(['cod.exe', self, 'electron.exe', 'cod.exe']);
    w.start();
    vi.advanceTimersByTime(2000 * 4);
    expect(switched).toEqual(['p2']);
    w.stop();
  });
});
