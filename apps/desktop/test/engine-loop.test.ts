import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { defaultProfile, type XInputState } from '@dualforge/shared';
import { createEngineLoop, type InputSource, type PadSink } from '../src/main/engine-loop.js';
import { createReplaySource } from '../src/main/replay-source.js';

const FIX = fileURLToPath(new URL('../../../packages/engine/test/fixtures/stick-sweep.hidlog', import.meta.url));

function fakeSink(): PadSink & { frames: XInputState[] } {
  const frames: XInputState[] = [];
  return { ready: true, frames, async connect() {}, update(x) { frames.push(structuredClone(x)); }, onRumble() {}, disconnect() {} };
}

describe('engine loop', () => {
  it('feeds replay frames through pipeline into the sink and emits snapshots', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const events: unknown[] = [];
    const loop = createEngineLoop({ source: createReplaySource(FIX, false), sink, emit: (e) => events.push(e), now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(sink.frames.length).toBeGreaterThan(150);
    expect(sink.frames.some((f) => f.buttons.A)).toBe(true);
    expect(events.some((e) => (e as { type: string }).type === 'snapshot')).toBe(true);
    loop.stop();
    vi.useRealTimers();
  });
  it('sends an output report when feedback changes', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const src: InputSource = { start(_r, s) { s(true); }, write(r) { writes.push(r); }, stop() {} };
    const loop = createEngineLoop({ source: src, sink: fakeSink(), emit: () => {}, now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[0]![0]).toBe(0x02);
    loop.stop(); vi.useRealTimers();
  });
});
