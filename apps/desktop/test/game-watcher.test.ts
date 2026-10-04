import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Settings } from '@dualforge/shared';
import { createGameWatcher } from '../src/main/game-watcher.js';

function rig(seq: string[], over: Partial<Settings> = {}, available = true) {
  let i = 0;
  const switched: string[] = [];
  const settings: Settings = { ...defaultSettings(), activeProfile: 'p1', autoSwitch: [{ exe: 'COD.exe', profileId: 'p2' }], ...over };
  const w = createGameWatcher({
    foreground: () => seq[Math.min(i++, seq.length - 1)]!,
    settings: () => settings, onSwitch: (id) => switched.push(id), available,
  });
  return { w, switched, settings };
}

describe('game watcher', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('switches once to the mapped profile (case-insensitive) and back when the game leaves the foreground', () => {
    const { w, switched } = rig(['explorer.exe', 'cod.exe', 'cod.exe', 'cod.exe', 'explorer.exe', 'explorer.exe']);
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
    const { w, switched } = rig(['a.exe', 'b.exe', 'x.exe'], { autoSwitch: [{ exe: 'a.exe', profileId: 'p2' }, { exe: 'b.exe', profileId: 'p3' }] });
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
    w.start(); w.stop();
    vi.advanceTimersByTime(10_000);
    expect(switched).toEqual([]);
  });
});
