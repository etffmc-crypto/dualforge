import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { defaultProfile, type XInputState } from '@dualforge/shared';
import { createEngineLoop, GRACE_MS, type InputSource, type PadSink } from '../src/main/engine-loop.js';
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
    await loop.stop();
    vi.useRealTimers();
  });
  it('sends an output report when feedback changes', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const src: InputSource = { start(_r, s) { s(true); }, async write(r) { writes.push(r); }, async stop() {} };
    const loop = createEngineLoop({ source: src, sink: fakeSink(), emit: () => {}, now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[0]![0]).toBe(0x02);
    await loop.stop(); vi.useRealTimers();
  });
});

describe('engine loop output reports and source swap', () => {
  it('writes output only on change or 250 ms keepalive', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const src: InputSource = { start(_r, s) { s(true); }, async write(r) { writes.push(r); }, async stop() {} };
    const loop = createEngineLoop({ source: src, sink: fakeSink(), emit: () => {}, now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(600);
    expect(writes.length).toBeGreaterThanOrEqual(3);
    expect(writes.length).toBeLessThanOrEqual(4);
    await loop.stop(); vi.useRealTimers();
  });
  it('swapSource clears rumble and trigger effects on the old source before stopping it', async () => {
    vi.useFakeTimers();
    const order: string[] = []; const writes: Uint8Array[] = [];
    const first: InputSource = { start(_r, s) { s(true); }, async write(r) { await Promise.resolve(); writes.push(r); order.push('write'); }, async stop() { order.push('stop'); } };
    const sink = fakeSink();
    const loop = createEngineLoop({ source: first, sink, emit: () => {}, now: () => performance.now() });
    const p = defaultProfile('p', 'p');
    p.triggers.right.effect = { mode: 'resistance', start: 2, force: 8 };
    loop.setProfile(p);
    await loop.start();
    sink.rumble!(1, 1);
    await vi.advanceTimersByTimeAsync(10);
    await loop.swapSource({ start() {}, async write() {}, async stop() {} });
    const last = writes[writes.length - 1]!;
    expect(last[3]).toBe(0); expect(last[4]).toBe(0);
    expect(last[11]).toBe(0x05); expect(last[22]).toBe(0x05);
    expect(order.slice(-2)).toEqual(['write', 'stop']);
    await loop.stop(); vi.useRealTimers();
  });
  it('swapSource emits status false and forces an output write on the new source', async () => {
    vi.useFakeTimers();
    const events: { type: string; connected?: boolean }[] = [];
    const writes: Uint8Array[] = [];
    const first: InputSource = { start(_r, s) { s(true); }, async write() {}, async stop() {} };
    const loop = createEngineLoop({ source: first, sink: fakeSink(), emit: (e) => events.push(e as never), now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(10);
    events.length = 0;
    const second: InputSource = { start(_r, s) { s(true); }, async write(r) { writes.push(r); }, async stop() {} };
    await loop.swapSource(second);
    expect(events[0]).toMatchObject({ type: 'status', connected: false });
    expect(writes.length).toBe(1);
    await loop.stop(); vi.useRealTimers();
  });
});

describe('engine loop safety and errors', () => {
  it('applies rumble from the sink callback to the output report (C1)', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const sink = fakeSink();
    const src: InputSource = { start(_r, st) { st(true); }, async write(r) { writes.push(r); }, async stop() {} };
    const loop = createEngineLoop({ source: src, sink, emit: () => {}, now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    sink.rumble!(1, 0.5);
    const last = writes[writes.length - 1]!;
    expect(last[4]).toBe(255);
    expect(last[3]).toBe(128);
    await loop.stop(); vi.useRealTimers();
  });
  it('neutralises the virtual pad and snapshot on disconnect (C2)', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const events: { type: string; snapshot?: { connected: boolean; reportHz: number } }[] = [];
    let report!: (b: Uint8Array, t: number) => void, status!: (c: boolean) => void;
    const src: InputSource = { start(r, st) { report = r; status = st; st(true); }, async write() {}, async stop() {} };
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
    await loop.stop(); vi.useRealTimers();
  });
  it('writes a zero-rumble report on stop (I6)', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const sink = fakeSink();
    const order: string[] = [];
    const src: InputSource = { start(_r, st) { st(true); }, async write(r) { await Promise.resolve(); writes.push(r); order.push('write'); }, async stop() { order.push('stop'); } };
    const loop = createEngineLoop({ source: src, sink, emit: () => {}, now: () => performance.now() });
    const p = defaultProfile('p', 'p');
    p.triggers.left.effect = { mode: 'resistance', start: 2, force: 8 };
    loop.setProfile(p);
    await loop.start();
    sink.rumble!(1, 1);
    await loop.stop();
    const last = writes[writes.length - 1]!;
    expect(last[3]).toBe(0); expect(last[4]).toBe(0);
    expect(last[11]).toBe(0x05); expect(last[22]).toBe(0x05);
    expect(order.slice(-2)).toEqual(['write', 'stop']);
    vi.useRealTimers();
  });
  it('dedupes source errors to one per code per 30 s (I4)', async () => {
    vi.useFakeTimers();
    const events: { type: string }[] = [];
    const src: InputSource = { start(_r, _s, onError) { for (let i = 0; i < 5; i++) onError('E_HID_OPEN', 'boom'); }, async write() {}, async stop() {} };
    const loop = createEngineLoop({ source: src, sink: fakeSink(), emit: (e) => events.push(e as never), now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.filter((e) => e.type === 'error')).toHaveLength(1);
    await loop.stop(); vi.useRealTimers();
  });
});

describe('engine loop plan 2: compiled profiles, grace release, trigger effects', () => {
  it('setProfile preserves filter state (no jump)', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    let report!: (b: Uint8Array, t: number) => void;
    const src: InputSource = { start(r, st) { report = r; st(true); }, async write() {}, async stop() {} };
    const loop = createEngineLoop({ source: src, sink, emit: () => {}, now: () => performance.now() });
    const a = defaultProfile('p', 'p');
    a.sticks.left.filter = { ...a.sticks.left.filter, enabled: true, strength: 100 };
    loop.setProfile(a);
    await loop.start();
    const stepReport = (): Uint8Array => { const b = usbReport(false); b[1] = 255; return b; };
    report(usbReport(false), 1000);
    for (let i = 1; i <= 20; i++) report(stepReport(), 1000 + i * 5);
    const before = sink.frames[sink.frames.length - 1]!.lx;
    expect(before).toBeGreaterThan(0.5);
    expect(before).toBeLessThan(0.99);
    const b = structuredClone(a);
    b.lights.r = 255;
    loop.setProfile(b);
    report(stepReport(), 1000 + 21 * 5);
    const after = sink.frames[sink.frames.length - 1]!.lx;
    expect(after).toBeGreaterThan(0.5);
    expect(after).toBeLessThan(0.99);   // a state reset would pass the raw value (1.0) straight through
    expect(after).toBeGreaterThanOrEqual(before);
    await loop.stop(); vi.useRealTimers();
  });
  it('releases the virtual pad 2 s after disconnect and reconnects on re-plug', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const connect = vi.fn(async () => { sink.ready = true; });
    const disconnect = vi.fn(() => { sink.ready = false; });
    sink.connect = connect; sink.disconnect = disconnect;
    let status!: (c: boolean) => void;
    const src: InputSource = { start(_r, st) { status = st; st(true); }, async write() {}, async stop() {} };
    const loop = createEngineLoop({ source: src, sink, emit: () => {}, now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    connect.mockClear();
    status(false);
    await vi.advanceTimersByTimeAsync(GRACE_MS - 1);
    expect(disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    status(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(connect).toHaveBeenCalledTimes(1);
    await loop.stop(); vi.useRealTimers();
  });
  it('re-plug inside the grace window keeps the pad and cancels the release', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const disconnect = vi.fn();
    sink.disconnect = disconnect;
    let status!: (c: boolean) => void;
    const src: InputSource = { start(_r, st) { status = st; st(true); }, async write() {}, async stop() {} };
    const loop = createEngineLoop({ source: src, sink, emit: () => {}, now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    status(false);
    await vi.advanceTimersByTimeAsync(1000);
    status(true);
    await vi.advanceTimersByTimeAsync(GRACE_MS * 2);
    expect(disconnect).not.toHaveBeenCalled();
    await loop.stop(); vi.useRealTimers();
  });
  it('includes trigger effects in the output report', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const src: InputSource = { start(_r, st) { st(true); }, async write(r) { writes.push(r); }, async stop() {} };
    const loop = createEngineLoop({ source: src, sink: fakeSink(), emit: () => {}, now: () => performance.now() });
    const p = defaultProfile('p', 'p');
    p.triggers.left.effect = { mode: 'resistance', start: 1, force: 2 };
    loop.setProfile(p);
    await loop.start();
    const last = writes[writes.length - 1]!;
    expect([last[22], last[23], last[24]]).toEqual([0x01, 1, 2]);
    expect(last[11]).toBe(0x05);
    await loop.stop(); vi.useRealTimers();
  });
  it('setProfile forces an output write even when the report is unchanged', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const src: InputSource = { start(_r, st) { st(true); }, async write(r) { writes.push(r); }, async stop() {} };
    const loop = createEngineLoop({ source: src, sink: fakeSink(), emit: () => {}, now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    const n = writes.length;
    loop.setProfile(defaultProfile('p', 'p'));
    expect(writes.length).toBe(n + 1);
    await loop.stop(); vi.useRealTimers();
  });

  it('emits exactly one E_VIGEM_INIT when ViGEm is missing', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    sink.ready = false;
    sink.connect = async () => { throw new Error('E_VIGEM_INIT missing'); };
    const events: { type: string; code?: string }[] = [];
    let status!: (c: boolean) => void;
    const src: InputSource = { start(_r, st) { status = st; }, async write() {}, async stop() {} };
    const loop = createEngineLoop({ source: src, sink, emit: (e) => events.push(e as never), now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    status(true); await vi.advanceTimersByTimeAsync(0);
    status(true); await vi.advanceTimersByTimeAsync(0);
    expect(events.filter((e) => e.type === 'error' && e.code === 'E_VIGEM_INIT')).toHaveLength(1);
    await loop.stop(); vi.useRealTimers();
  });
  it('does not run concurrent connect() calls', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const connect = vi.fn(() => new Promise<void>((res) => { setTimeout(() => { sink.ready = true; res(); }, 50); }));
    sink.ready = false; sink.connect = connect;
    let status!: (c: boolean) => void;
    const src: InputSource = { start(_r, st) { status = st; }, async write() {}, async stop() {} };
    const loop = createEngineLoop({ source: src, sink, emit: () => {}, now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    const started = loop.start();
    await vi.advanceTimersByTimeAsync(50); await started;
    connect.mockClear(); sink.ready = false;
    status(true); await vi.advanceTimersByTimeAsync(3);
    status(false); await vi.advanceTimersByTimeAsync(3);
    status(true); await vi.advanceTimersByTimeAsync(3);
    await vi.advanceTimersByTimeAsync(60);
    expect(connect).toHaveBeenCalledTimes(1);
    await loop.stop(); vi.useRealTimers();
  });
  it('swapSource arms the grace release for a source that never connects', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const disconnect = vi.fn(); sink.disconnect = disconnect;
    const first: InputSource = { start(_r, st) { st(true); }, async write() {}, async stop() {} };
    const loop = createEngineLoop({ source: first, sink, emit: () => {}, now: () => performance.now() });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await loop.swapSource({ start() {}, async write() {}, async stop() {} });
    await vi.advanceTimersByTimeAsync(GRACE_MS - 1);
    expect(disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    await loop.stop(); vi.useRealTimers();
  });
});
