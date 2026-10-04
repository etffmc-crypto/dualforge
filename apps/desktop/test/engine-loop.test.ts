import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { defaultProfile, type XInputState } from '@dualforge/shared';
import { createEngineLoop, type InputSource, type PadSink } from '../src/main/engine-loop.js';
import { createReplaySource } from '../src/main/replay-source.js';

const FIX = fileURLToPath(new URL('../../../packages/engine/test/fixtures/stick-sweep.hidlog', import.meta.url));

function fakeSink(): PadSink & { frames: XInputState[]; rumble: ((l: number, s: number) => void) | null } {
  const frames: XInputState[] = [];
  const sink = {
    ready: true, frames, rumble: null as ((l: number, s: number) => void) | null,
    async connect() {}, update(x: XInputState) { frames.push(structuredClone(x)); },
    onRumble(cb: (l: number, s: number) => void) { sink.rumble = cb; }, disconnect() {},
  };
  return sink;
}
function usbReport(cross: boolean): Uint8Array {
  const b = new Uint8Array(64);
  b[0] = 0x01; b[1] = b[2] = b[3] = b[4] = 128;
  if (cross) b[8] = 0x20;
  return b;
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

describe('engine loop output reports and source swap', () => {
  it('writes output only on change or 250 ms keepalive', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const src: InputSource = { start(_r, s) { s(true); }, write(r) { writes.push(r); }, stop() {} };
    const loop = createEngineLoop({ source: src, sink: fakeSink(), emit: () => {}, now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(600);
    expect(writes.length).toBeGreaterThanOrEqual(3);
    expect(writes.length).toBeLessThanOrEqual(4);
    loop.stop(); vi.useRealTimers();
  });
  it('swapSource emits status false and forces an output write on the new source', async () => {
    vi.useFakeTimers();
    const events: { type: string; connected?: boolean }[] = [];
    const writes: Uint8Array[] = [];
    const first: InputSource = { start(_r, s) { s(true); }, write() {}, stop() {} };
    const loop = createEngineLoop({ source: first, sink: fakeSink(), emit: (e) => events.push(e as never), now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(10);
    events.length = 0;
    const second: InputSource = { start(_r, s) { s(true); }, write(r) { writes.push(r); }, stop() {} };
    loop.swapSource(second);
    expect(events[0]).toMatchObject({ type: 'status', connected: false });
    expect(writes.length).toBe(1);
    loop.stop(); vi.useRealTimers();
  });
});

describe('engine loop safety and errors', () => {
  it('applies rumble from the sink callback to the output report (C1)', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const sink = fakeSink();
    const src: InputSource = { start(_r, st) { st(true); }, write(r) { writes.push(r); }, stop() {} };
    const loop = createEngineLoop({ source: src, sink, emit: () => {}, now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    sink.rumble!(1, 0.5);
    const last = writes[writes.length - 1]!;
    expect(last[4]).toBe(255);
    expect(last[3]).toBe(128);
    loop.stop(); vi.useRealTimers();
  });
  it('neutralises the virtual pad and snapshot on disconnect (C2)', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const events: { type: string; snapshot?: { connected: boolean; reportHz: number } }[] = [];
    let report!: (b: Uint8Array, t: number) => void, status!: (c: boolean) => void;
    const src: InputSource = { start(r, st) { report = r; status = st; st(true); }, write() {}, stop() {} };
    const loop = createEngineLoop({ source: src, sink, emit: (e) => events.push(e as never), now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    report(usbReport(true), performance.now());
    expect(sink.frames[sink.frames.length - 1]!.buttons.A).toBe(true);
    events.length = 0;
    status(false);
    const f = sink.frames[sink.frames.length - 1]!;
    expect(f.buttons.A).toBe(false);
    expect([f.lx, f.ly, f.rx, f.ry, f.lt, f.rt]).toEqual([0, 0, 0, 0, 0, 0]);
    const snap = events.find((e) => e.type === 'snapshot')!;
    expect(snap.snapshot).toMatchObject({ connected: false, reportHz: 0 });
    loop.stop(); vi.useRealTimers();
  });
  it('writes a zero-rumble report on stop (I6)', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const sink = fakeSink();
    const src: InputSource = { start(_r, st) { st(true); }, write(r) { writes.push(r); }, stop() {} };
    const loop = createEngineLoop({ source: src, sink, emit: () => {}, now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    sink.rumble!(1, 1);
    loop.stop();
    const last = writes[writes.length - 1]!;
    expect(last[3]).toBe(0); expect(last[4]).toBe(0);
    vi.useRealTimers();
  });
  it('dedupes source errors to one per code per 30 s (I4)', async () => {
    vi.useFakeTimers();
    const events: { type: string }[] = [];
    const src: InputSource = { start(_r, _s, onError) { for (let i = 0; i < 5; i++) onError('E_HID_OPEN', 'boom'); }, write() {}, stop() {} };
    const loop = createEngineLoop({ source: src, sink: fakeSink(), emit: (e) => events.push(e as never), now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.filter((e) => e.type === 'error')).toHaveLength(1);
    loop.stop(); vi.useRealTimers();
  });
});
