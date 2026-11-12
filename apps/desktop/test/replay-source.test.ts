import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReplaySource } from '../src/main/replay-source.js';

const HEX = '01' + '80'.repeat(63);
const dirs: string[] = [];

function logFile(ts: number[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'df-replay-'));
  dirs.push(dir);
  const path = join(dir, 'x.hidlog');
  writeFileSync(path, ts.map((t) => JSON.stringify({ t, hex: HEX })).join('\n'));
  return path;
}

afterEach(() => {
  vi.useRealTimers();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('replay source pacing', () => {
  it('releases each report at its recorded time, not one per tick', async () => {
    vi.useFakeTimers();
    const src = createReplaySource(logFile([0, 10, 20]), false);
    const stamps: number[] = [];
    src.start(
      (_b, t) => stamps.push(t),
      () => {},
      () => {},
    );
    await vi.advanceTimersByTimeAsync(5);
    expect(stamps).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(stamps).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10);
    expect(stamps).toHaveLength(3);
    await src.stop();
  });

  it('keeps timestamps increasing across loop wrap-around', async () => {
    vi.useFakeTimers();
    const src = createReplaySource(logFile([0, 10, 20]), true);
    const stamps: number[] = [];
    src.start(
      (_b, t) => stamps.push(t),
      () => {},
      () => {},
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(stamps.length).toBeGreaterThan(6);
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]!).toBeGreaterThan(stamps[i - 1]!);
    await src.stop();
  });

  it('reports not-ready after a one-shot replay finishes', async () => {
    vi.useFakeTimers();
    const src = createReplaySource(logFile([0, 10]), false);
    const status: boolean[] = [];
    src.start(
      () => {},
      (s) => status.push(s),
      () => {},
    );
    await vi.advanceTimersByTimeAsync(50);
    expect(status).toEqual([true, false]);
    await src.stop();
  });
});
