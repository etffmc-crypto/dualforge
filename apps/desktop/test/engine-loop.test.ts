import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  EngineSnapshotSchema,
  defaultProfile,
  defaultSettings,
  type EngineEvent,
  type XInputState,
} from '@dualforge/shared';
import {
  createEngineLoop,
  GRACE_MS,
  type InputSource,
  type PadSink,
} from '../src/main/engine-loop.js';
import { createReplaySource } from '../src/main/replay-source.js';

const FIX = fileURLToPath(
  new URL('../../../packages/engine/test/fixtures/stick-sweep.hidlog', import.meta.url),
);

function fakeSink(): PadSink & {
  frames: XInputState[];
  rumble: ((l: number, s: number) => void) | null;
} {
  const frames: XInputState[] = [];
  const sink = {
    ready: true,
    frames,
    rumble: null as ((l: number, s: number) => void) | null,
    async connect() {},
    update(x: XInputState) {
      frames.push(structuredClone(x));
    },
    onRumble(cb: (l: number, s: number) => void) {
      sink.rumble = cb;
    },
    disconnect() {},
  };
  return sink;
}
function usbReport(cross: boolean): Uint8Array {
  const b = new Uint8Array(64);
  b[0] = 0x01;
  b[1] = b[2] = b[3] = b[4] = 128;
  if (cross) b[8] = 0x20;
  return b;
}

describe('engine loop', () => {
  it('feeds replay frames through pipeline into the sink and emits snapshots', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const events: unknown[] = [];
    const loop = createEngineLoop({
      source: createReplaySource(FIX, false),
      sink,
      emit: (e) => events.push(e),
      now: () => performance.now(),
    });
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
    const src: InputSource = {
      kind: 'device',
      start(_r, s) {
        s(true);
      },
      async write(r) {
        writes.push(r);
      },
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink: fakeSink(),
      emit: () => {},
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[0]![0]).toBe(0x02);
    await loop.stop();
    vi.useRealTimers();
  });
});

describe('engine loop output reports and source swap', () => {
  it('writes output only on change or 250 ms keepalive', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const src: InputSource = {
      kind: 'device',
      start(_r, s) {
        s(true);
      },
      async write(r) {
        writes.push(r);
      },
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink: fakeSink(),
      emit: () => {},
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(600);
    expect(writes.length).toBeGreaterThanOrEqual(3);
    expect(writes.length).toBeLessThanOrEqual(4);
    await loop.stop();
    vi.useRealTimers();
  });
  it('swapSource clears rumble and trigger effects on the old source before stopping it', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const writes: Uint8Array[] = [];
    const first: InputSource = {
      kind: 'device',
      start(_r, s) {
        s(true);
      },
      async write(r) {
        await Promise.resolve();
        writes.push(r);
        order.push('write');
      },
      async stop() {
        order.push('stop');
      },
    };
    const sink = fakeSink();
    const loop = createEngineLoop({
      source: first,
      sink,
      emit: () => {},
      now: () => performance.now(),
    });
    const p = defaultProfile('p', 'p');
    p.triggers.right.effect = { mode: 'resistance', start: 2, force: 8 };
    loop.setProfile(p);
    await loop.start();
    sink.rumble!(1, 1);
    await vi.advanceTimersByTimeAsync(10);
    await loop.swapSource({ kind: 'device', start() {}, async write() {}, async stop() {} });
    const last = writes[writes.length - 1]!;
    expect(last[3]).toBe(0);
    expect(last[4]).toBe(0);
    expect(last[11]).toBe(0x05);
    expect(last[22]).toBe(0x05);
    expect(order.slice(-2)).toEqual(['write', 'stop']);
    await loop.stop();
    vi.useRealTimers();
  });
  it('serialises concurrent swapSource calls', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const mk = (n: string): InputSource => ({
      kind: 'device',
      start() {
        order.push(`start ${n}`);
      },
      async write() {},
      async stop() {
        await Promise.resolve();
        order.push(`stop ${n}`);
      },
    });
    const loop = createEngineLoop({
      source: mk('a'),
      sink: fakeSink(),
      emit: () => {},
      now: () => performance.now(),
    });
    await Promise.all([loop.swapSource(mk('b')), loop.swapSource(mk('c'))]);
    expect(order).toEqual(['stop a', 'start b', 'stop b', 'start c']);
    await loop.stop();
    vi.useRealTimers();
  });
  it('swapSource emits status false and forces an output write on the new source', async () => {
    vi.useFakeTimers();
    const events: { type: string; connected?: boolean }[] = [];
    const writes: Uint8Array[] = [];
    const first: InputSource = {
      kind: 'device',
      start(_r, s) {
        s(true);
      },
      async write() {},
      async stop() {},
    };
    const loop = createEngineLoop({
      source: first,
      sink: fakeSink(),
      emit: (e) => events.push(e as never),
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(10);
    events.length = 0;
    const second: InputSource = {
      kind: 'device',
      start(_r, s) {
        s(true);
      },
      async write(r) {
        writes.push(r);
      },
      async stop() {},
    };
    await loop.swapSource(second);
    expect(events[0]).toMatchObject({ type: 'status', connected: false });
    expect(writes.length).toBe(1);
    await loop.stop();
    vi.useRealTimers();
  });
});

describe('engine loop safety and errors', () => {
  it('applies rumble from the sink callback to the output report (C1)', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const sink = fakeSink();
    const src: InputSource = {
      kind: 'device',
      start(_r, st) {
        st(true);
      },
      async write(r) {
        writes.push(r);
      },
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink,
      emit: () => {},
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    loop.setSettings({ ...defaultSettings(), hasRumble: true });
    await loop.start();
    sink.rumble!(1, 0.5);
    const last = writes[writes.length - 1]!;
    expect(last[4]).toBe(255);
    expect(last[3]).toBe(128);
    await loop.stop();
    vi.useRealTimers();
  });
  it('neutralises the virtual pad and snapshot on disconnect (C2)', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const events: { type: string; snapshot?: { connected: boolean; reportHz: number } }[] = [];
    let report!: (b: Uint8Array, t: number) => void, status!: (c: boolean) => void;
    const src: InputSource = {
      kind: 'device',
      start(r, st) {
        report = r;
        status = st;
        st(true);
      },
      async write() {},
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink,
      emit: (e) => events.push(e as never),
      now: () => performance.now(),
    });
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
    await loop.stop();
    vi.useRealTimers();
  });
  it('writes a zero-rumble report on stop (I6)', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const sink = fakeSink();
    const order: string[] = [];
    const src: InputSource = {
      kind: 'device',
      start(_r, st) {
        st(true);
      },
      async write(r) {
        await Promise.resolve();
        writes.push(r);
        order.push('write');
      },
      async stop() {
        order.push('stop');
      },
    };
    const loop = createEngineLoop({
      source: src,
      sink,
      emit: () => {},
      now: () => performance.now(),
    });
    const p = defaultProfile('p', 'p');
    p.triggers.left.effect = { mode: 'resistance', start: 2, force: 8 };
    loop.setProfile(p);
    await loop.start();
    sink.rumble!(1, 1);
    await loop.stop();
    const last = writes[writes.length - 1]!;
    expect(last[3]).toBe(0);
    expect(last[4]).toBe(0);
    expect(last[11]).toBe(0x05);
    expect(last[22]).toBe(0x05);
    expect(order.slice(-2)).toEqual(['write', 'stop']);
    vi.useRealTimers();
  });
  it('dedupes source errors to one per code per 30 s (I4)', async () => {
    vi.useFakeTimers();
    const events: { type: string }[] = [];
    const src: InputSource = {
      kind: 'device',
      start(_r, _s, onError) {
        for (let i = 0; i < 5; i++) onError('E_HID_OPEN', 'boom');
      },
      async write() {},
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink: fakeSink(),
      emit: (e) => events.push(e as never),
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.filter((e) => e.type === 'error')).toHaveLength(1);
    await loop.stop();
    vi.useRealTimers();
  });
});

describe('engine loop plan 2: compiled profiles, grace release, trigger effects', () => {
  it('setProfile preserves filter state (no jump)', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    let report!: (b: Uint8Array, t: number) => void;
    const src: InputSource = {
      kind: 'device',
      start(r, st) {
        report = r;
        st(true);
      },
      async write() {},
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink,
      emit: () => {},
      now: () => performance.now(),
    });
    const a = defaultProfile('p', 'p');
    a.sticks.left.filter = { ...a.sticks.left.filter, enabled: true, strength: 100 };
    loop.setProfile(a);
    await loop.start();
    const stepReport = (): Uint8Array => {
      const b = usbReport(false);
      b[1] = 255;
      return b;
    };
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
    expect(after).toBeLessThan(0.99); // a state reset would pass the raw value (1.0) straight through
    expect(after).toBeGreaterThanOrEqual(before);
    await loop.stop();
    vi.useRealTimers();
  });
  it('releases the virtual pad 2 s after disconnect and reconnects on re-plug', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const connect = vi.fn(async () => {
      sink.ready = true;
    });
    const disconnect = vi.fn(() => {
      sink.ready = false;
    });
    sink.connect = connect;
    sink.disconnect = disconnect;
    let status!: (c: boolean) => void;
    const src: InputSource = {
      kind: 'device',
      start(_r, st) {
        status = st;
        st(true);
      },
      async write() {},
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink,
      emit: () => {},
      now: () => performance.now(),
    });
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
    await loop.stop();
    vi.useRealTimers();
  });
  it('re-plug inside the grace window keeps the pad and cancels the release', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const disconnect = vi.fn();
    sink.disconnect = disconnect;
    let status!: (c: boolean) => void;
    const src: InputSource = {
      kind: 'device',
      start(_r, st) {
        status = st;
        st(true);
      },
      async write() {},
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink,
      emit: () => {},
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    status(false);
    await vi.advanceTimersByTimeAsync(1000);
    status(true);
    await vi.advanceTimersByTimeAsync(GRACE_MS * 2);
    expect(disconnect).not.toHaveBeenCalled();
    await loop.stop();
    vi.useRealTimers();
  });
  it('includes trigger effects in the output report', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const src: InputSource = {
      kind: 'device',
      start(_r, st) {
        st(true);
      },
      async write(r) {
        writes.push(r);
      },
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink: fakeSink(),
      emit: () => {},
      now: () => performance.now(),
    });
    const p = defaultProfile('p', 'p');
    p.triggers.left.effect = { mode: 'resistance', start: 1, force: 2 };
    loop.setProfile(p);
    await loop.start();
    const last = writes[writes.length - 1]!;
    expect([last[22], last[23], last[24]]).toEqual([0x01, 1, 2]);
    expect(last[11]).toBe(0x05);
    await loop.stop();
    vi.useRealTimers();
  });
  it('setProfile forces an output write even when the report is unchanged', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const src: InputSource = {
      kind: 'device',
      start(_r, st) {
        st(true);
      },
      async write(r) {
        writes.push(r);
      },
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink: fakeSink(),
      emit: () => {},
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    const n = writes.length;
    loop.setProfile(defaultProfile('p', 'p'));
    expect(writes.length).toBe(n + 1);
    await loop.stop();
    vi.useRealTimers();
  });

  it('emits exactly one E_VIGEM_INIT when ViGEm is missing', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    sink.ready = false;
    sink.connect = async () => {
      throw new Error('E_VIGEM_INIT missing');
    };
    const events: { type: string; code?: string }[] = [];
    let status!: (c: boolean) => void;
    const src: InputSource = {
      kind: 'device',
      start(_r, st) {
        status = st;
      },
      async write() {},
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink,
      emit: (e) => events.push(e as never),
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    status(true);
    await vi.advanceTimersByTimeAsync(0);
    status(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(events.filter((e) => e.type === 'error' && e.code === 'E_VIGEM_INIT')).toHaveLength(1);
    await loop.stop();
    vi.useRealTimers();
  });

  it('reports a failed virtual-pad plug-in as E_VIGEM_TARGET, distinct from E_VIGEM_INIT', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    sink.ready = false;
    sink.connect = async () => {
      throw new Error('E_VIGEM_TARGET busy');
    };
    const events: { type: string; code?: string }[] = [];
    let status!: (c: boolean) => void;
    const src: InputSource = {
      kind: 'device',
      start(_r, st) {
        status = st;
      },
      async write() {},
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink,
      emit: (e) => events.push(e as never),
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    status(true);
    await vi.advanceTimersByTimeAsync(0);
    status(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(events.filter((e) => e.type === 'error' && e.code === 'E_VIGEM_TARGET')).toHaveLength(1);
    expect(events.some((e) => e.code === 'E_VIGEM_INIT')).toBe(false);
    await loop.stop();
    vi.useRealTimers();
  });
  it('does not run concurrent connect() calls', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const connect = vi.fn(
      () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            sink.ready = true;
            res();
          }, 50);
        }),
    );
    sink.ready = false;
    sink.connect = connect;
    let status!: (c: boolean) => void;
    const src: InputSource = {
      kind: 'device',
      start(_r, st) {
        status = st;
      },
      async write() {},
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink,
      emit: () => {},
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    const started = loop.start();
    await vi.advanceTimersByTimeAsync(50);
    await started;
    connect.mockClear();
    sink.ready = false;
    status(true);
    await vi.advanceTimersByTimeAsync(3);
    status(false);
    await vi.advanceTimersByTimeAsync(3);
    status(true);
    await vi.advanceTimersByTimeAsync(3);
    await vi.advanceTimersByTimeAsync(60);
    expect(connect).toHaveBeenCalledTimes(1);
    await loop.stop();
    vi.useRealTimers();
  });
  it('swapSource arms the grace release for a source that never connects', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const disconnect = vi.fn();
    sink.disconnect = disconnect;
    const first: InputSource = {
      kind: 'device',
      start(_r, st) {
        st(true);
      },
      async write() {},
      async stop() {},
    };
    const loop = createEngineLoop({
      source: first,
      sink,
      emit: () => {},
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await loop.swapSource({ kind: 'device', start() {}, async write() {}, async stop() {} });
    await vi.advanceTimersByTimeAsync(GRACE_MS - 1);
    expect(disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    await loop.stop();
    vi.useRealTimers();
  });
});

function fakeInjector() {
  const calls: string[] = [];
  return {
    calls,
    key: (c: string, d: boolean) => calls.push(`key ${c} ${d ? 'down' : 'up'}`),
    mouse: (b: string, d: boolean) => calls.push(`mouse ${b} ${d ? 'down' : 'up'}`),
    move: (dx: number, dy: number) => calls.push(`move ${dx} ${dy}`),
  };
}
function keyProfile() {
  const p = defaultProfile('p', 'p');
  p.mappings.cross = {
    targets: [{ type: 'key', code: 'VK_SPACE' }],
    turbo: { mode: 'off', hz: 12 },
    continuous: false,
  };
  return p;
}
async function injectorRig() {
  const injector = fakeInjector();
  let report!: (b: Uint8Array, t: number) => void;
  const src: InputSource = {
    kind: 'device',
    start(r, st) {
      report = r;
      st(true);
    },
    async write() {},
    async stop() {},
  };
  const loop = createEngineLoop({
    source: src,
    sink: fakeSink(),
    emit: () => {},
    now: () => performance.now(),
    injector,
  });
  loop.setProfile(keyProfile());
  await loop.start();
  return { injector, loop, report: (b: Uint8Array) => report(b, performance.now()) };
}

describe('engine loop plan 3a: injector gate, rumble setting, lights cadence', () => {
  it('key events reach the injector when the UI is not focused', async () => {
    vi.useFakeTimers();
    const { injector, loop, report } = await injectorRig();
    loop.setUiFocused(false);
    report(usbReport(true));
    report(usbReport(false));
    expect(injector.calls).toEqual(['key VK_SPACE down', 'key VK_SPACE up']);
    await loop.stop();
    vi.useRealTimers();
  });
  it('injects nothing while uiFocused (the default)', async () => {
    vi.useFakeTimers();
    const { injector, loop, report } = await injectorRig();
    report(usbReport(true));
    report(usbReport(false));
    expect(injector.calls).toEqual([]);
    await loop.stop();
    vi.useRealTimers();
  });
  it('releases held injected keys when the UI gains focus', async () => {
    vi.useFakeTimers();
    const { injector, loop, report } = await injectorRig();
    loop.setUiFocused(false);
    report(usbReport(true));
    loop.setUiFocused(true);
    expect(injector.calls).toEqual(['key VK_SPACE down', 'key VK_SPACE up']);
    report(usbReport(false)); // late release must not re-send an up
    expect(injector.calls).toHaveLength(2);
    await loop.stop();
    vi.useRealTimers();
  });
  it('hasRumble false forces rumble bytes to 0 and ignores sink vibration', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const sink = fakeSink();
    const src: InputSource = {
      kind: 'device',
      start(_r, st) {
        st(true);
      },
      async write(r) {
        writes.push(r);
      },
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink,
      emit: () => {},
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    sink.rumble!(1, 1);
    await vi.advanceTimersByTimeAsync(600);
    for (const w of writes) {
      expect(w[3]).toBe(0);
      expect(w[4]).toBe(0);
    }
    await loop.stop();
    vi.useRealTimers();
  });
  it('breathing lights write >= 2 distinct lightbar colours within 1 s', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const src: InputSource = {
      kind: 'device',
      start(_r, st) {
        st(true);
      },
      async write(r) {
        writes.push(r);
      },
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink: fakeSink(),
      emit: () => {},
      now: () => performance.now(),
    });
    const p = defaultProfile('p', 'p');
    p.lights = { ...p.lights, mode: 'breathing', speed: 100, r: 255, g: 0, b: 255 };
    loop.setProfile(p);
    await loop.start();
    await vi.advanceTimersByTimeAsync(1000);
    const colours = new Set(writes.map((w) => `${w[45]},${w[46]},${w[47]}`));
    expect(colours.size).toBeGreaterThanOrEqual(2);
    await loop.stop();
    vi.useRealTimers();
  });
  it('rate-limits lightbar animation writes under a 1 kHz report stream', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    let report!: (b: Uint8Array, t: number) => void;
    const src: InputSource = {
      kind: 'device',
      start(r, st) {
        report = r;
        st(true);
      },
      async write(r) {
        writes.push(r);
      },
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink: fakeSink(),
      emit: () => {},
      now: () => performance.now(),
    });
    const p = defaultProfile('p', 'p');
    p.lights = { ...p.lights, mode: 'breathing', speed: 100, r: 255, g: 0, b: 255 };
    loop.setProfile(p);
    await loop.start();
    writes.length = 0;
    for (let i = 0; i < 1000; i++) {
      report(usbReport(false), performance.now());
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(writes.length).toBeLessThanOrEqual(35);
    expect(writes.length).toBeGreaterThan(5);
    await loop.stop();
    vi.useRealTimers();
  });
});

describe('engine loop final review: replay never injects, macros survive profile edits', () => {
  async function rig(kind: 'device' | 'replay', allowInject = true) {
    const injector = fakeInjector();
    let report!: (b: Uint8Array, t: number) => void;
    const src: InputSource = {
      kind,
      start(r, st) {
        report = r;
        st(true);
      },
      async write() {},
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink: fakeSink(),
      emit: () => {},
      now: () => performance.now(),
      injector,
      allowInject,
    });
    loop.setProfile(keyProfile());
    await loop.start();
    loop.setUiFocused(false);
    return { injector, loop, report: (b: Uint8Array) => report(b, performance.now()) };
  }
  it('a replay source never reaches the injector, even when the UI is unfocused', async () => {
    vi.useFakeTimers();
    const { injector, loop, report } = await rig('replay');
    report(usbReport(true));
    report(usbReport(false));
    expect(injector.calls).toEqual([]);
    await loop.stop();
    vi.useRealTimers();
  });
  it('a device source injects when unfocused', async () => {
    vi.useFakeTimers();
    const { injector, loop, report } = await rig('device');
    report(usbReport(true));
    report(usbReport(false));
    expect(injector.calls).toEqual(['key VK_SPACE down', 'key VK_SPACE up']);
    await loop.stop();
    vi.useRealTimers();
  });
  it('allowInject=false (DUALFORGE_NO_INJECT) disables injection for a device source', async () => {
    vi.useFakeTimers();
    const { injector, loop, report } = await rig('device', false);
    report(usbReport(true));
    report(usbReport(false));
    expect(injector.calls).toEqual([]);
    await loop.stop();
    vi.useRealTimers();
  });

  const macroProfile = (steps: string[], loop: boolean) => {
    const p = defaultProfile('p', 'p');
    p.macros = [
      {
        id: 'm',
        name: 'm',
        loop,
        steps: steps.map((code) => ({
          target: { type: 'key' as const, code },
          holdMs: 100,
          delayMs: 0,
        })),
      },
    ];
    p.mappings.cross = {
      targets: [{ type: 'macro', macroId: 'm' }],
      turbo: { mode: 'off', hz: 12 },
      continuous: false,
    };
    return p;
  };
  it('editing a running macro to a shorter one mid-run does not crash; held keys are released', async () => {
    vi.useFakeTimers();
    const injector = fakeInjector();
    let report!: (b: Uint8Array, t: number) => void;
    const src: InputSource = {
      kind: 'device',
      start(r, st) {
        report = r;
        st(true);
      },
      async write() {},
      async stop() {},
    };
    const events: { type: string }[] = [];
    const loop = createEngineLoop({
      source: src,
      sink: fakeSink(),
      emit: (e) => events.push(e as never),
      now: () => performance.now(),
      injector,
    });
    loop.setProfile(macroProfile(['VK_A', 'VK_B', 'VK_C'], false));
    await loop.start();
    loop.setUiFocused(false);
    report(usbReport(true), performance.now());
    await vi.advanceTimersByTimeAsync(150); // into step 1 (VK_B)
    report(usbReport(true), performance.now());
    expect(injector.calls).toContain('key VK_B down');
    loop.setProfile(macroProfile(['VK_D'], false));
    await vi.advanceTimersByTimeAsync(5);
    expect(() => report(usbReport(true), performance.now())).not.toThrow();
    expect(injector.calls.at(-1)).toBe('key VK_B up');
    expect(events.some((e) => e.type === 'error')).toBe(false);
    await loop.stop();
    vi.useRealTimers();
  });
  it('editing a running looping macro restarts it from step 0', async () => {
    vi.useFakeTimers();
    const injector = fakeInjector();
    let report!: (b: Uint8Array, t: number) => void;
    const src: InputSource = {
      kind: 'device',
      start(r, st) {
        report = r;
        st(true);
      },
      async write() {},
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink: fakeSink(),
      emit: () => {},
      now: () => performance.now(),
      injector,
    });
    loop.setProfile(macroProfile(['VK_A', 'VK_B', 'VK_C'], true));
    await loop.start();
    loop.setUiFocused(false);
    report(usbReport(true), performance.now());
    await vi.advanceTimersByTimeAsync(150);
    report(usbReport(true), performance.now());
    loop.setProfile(macroProfile(['VK_D'], true));
    await vi.advanceTimersByTimeAsync(5);
    report(usbReport(true), performance.now());
    expect(injector.calls.slice(-2).sort()).toEqual(['key VK_B up', 'key VK_D down']);
    await loop.stop();
    vi.useRealTimers();
  });
});

describe('engine loop plan 3b: runMacro', () => {
  async function macroRig() {
    let report!: (b: Uint8Array, t: number) => void;
    const sink = fakeSink();
    const src: InputSource = {
      kind: 'device',
      start(r, st) {
        report = r;
        st(true);
      },
      async write() {},
      async stop() {},
    };
    let now = 0;
    const loop = createEngineLoop({ source: src, sink, emit: () => {}, now: () => now });
    const p = defaultProfile('p', 'p');
    p.macros = [
      {
        id: 'm1',
        name: 'Tap B',
        loop: false,
        steps: [
          { target: { type: 'xbutton', button: 'B' }, holdMs: 50, delayMs: 20 },
          { target: { type: 'xbutton', button: 'Y' }, holdMs: 30, delayMs: 0 },
        ],
      },
    ];
    loop.setProfile(p);
    await loop.start();
    const at = (t: number) => {
      now = t;
      report(usbReport(false), t);
      return sink.frames.at(-1)!;
    };
    return { loop, at };
  }
  it('starts the macro on the running pipeline: its steps reach the virtual pad, then it ends', async () => {
    vi.useFakeTimers();
    const { loop, at } = await macroRig();
    at(1000);
    loop.runMacro('m1');
    expect(at(1010).buttons.B).toBe(true);
    expect(at(1040).buttons.B).toBe(true);
    const gap = at(1060);
    expect(gap.buttons.B || gap.buttons.Y).toBe(false);
    expect(at(1080).buttons.Y).toBe(true);
    const end = at(1200);
    expect(end.buttons.B || end.buttons.Y).toBe(false);
    await loop.stop();
    vi.useRealTimers();
  });
  it('an unknown macro id is a no-op', async () => {
    vi.useFakeTimers();
    const { loop, at } = await macroRig();
    at(1000);
    expect(() => loop.runMacro('nope')).not.toThrow();
    expect(at(1010).buttons.B).toBe(false);
    await loop.stop();
    vi.useRealTimers();
  });
});

describe('engine loop plan 3b: runMacro and the focus gate', () => {
  async function rig(focused: boolean) {
    const injector = fakeInjector();
    const sink = fakeSink();
    let report!: (b: Uint8Array, t: number) => void;
    const src: InputSource = {
      kind: 'device',
      start(r, st) {
        report = r;
        st(true);
      },
      async write() {},
      async stop() {},
    };
    let now = 0;
    const loop = createEngineLoop({
      source: src,
      sink,
      emit: () => {},
      now: () => now,
      injector,
      allowInject: true,
    });
    const p = defaultProfile('p', 'p');
    p.macros = [
      {
        id: 'm',
        name: 'Key then B',
        loop: false,
        steps: [
          { target: { type: 'key', code: 'VK_SPACE' }, holdMs: 40, delayMs: 0 },
          { target: { type: 'xbutton', button: 'B' }, holdMs: 40, delayMs: 0 },
        ],
      },
    ];
    loop.setProfile(p);
    await loop.start();
    loop.setUiFocused(focused);
    const at = (t: number) => {
      now = t;
      report(usbReport(false), t);
      return sink.frames.at(-1)!;
    };
    return { loop, at, injector };
  }
  it('while DualForge is focused a play-test drives the virtual pad but injects no key', async () => {
    vi.useFakeTimers();
    const { loop, at, injector } = await rig(true);
    at(1000);
    loop.runMacro('m');
    at(1010); // key step active
    expect(at(1060).buttons.B).toBe(true); // xbutton step reaches the sink
    at(1200);
    expect(injector.calls).toEqual([]);
    await loop.stop();
    vi.useRealTimers();
  });
  it('control: unfocused, the same key step is injected', async () => {
    vi.useFakeTimers();
    const { loop, at, injector } = await rig(false);
    at(1000);
    loop.runMacro('m');
    at(1010);
    at(1060);
    at(1200);
    expect(injector.calls).toEqual(['key VK_SPACE down', 'key VK_SPACE up']);
    await loop.stop();
    vi.useRealTimers();
  });
});

describe('engine loop plan 3b: testRumble', () => {
  async function rumbleRig(hasRumble: boolean) {
    const writes: Uint8Array[] = [];
    const src: InputSource = {
      kind: 'device',
      start(_r, st) {
        st(true);
      },
      async write(r) {
        writes.push(r);
      },
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink: fakeSink(),
      emit: () => {},
      now: () => performance.now(),
    });
    const p = defaultProfile('p', 'p');
    p.vibration = { left: 30, right: 30 }; // the test pulse plays its own levels, not scaled again by the profile
    loop.setProfile(p);
    loop.setSettings({ ...defaultSettings(), hasRumble });
    await loop.start();
    return { loop, writes };
  }
  it('plays the requested levels on bytes 4 (left) / 3 (right), then zero after ms', async () => {
    vi.useFakeTimers();
    const { loop, writes } = await rumbleRig(true);
    loop.testRumble(1, 0.5, 300);
    let last = writes.at(-1)!;
    expect(last[4]).toBe(255);
    expect(last[3]).toBe(128);
    await vi.advanceTimersByTimeAsync(200);
    last = writes.at(-1)!;
    expect([last[4], last[3]]).toEqual([255, 128]);
    await vi.advanceTimersByTimeAsync(150);
    last = writes.at(-1)!;
    expect([last[4], last[3]]).toEqual([0, 0]);
    await loop.stop();
    vi.useRealTimers();
  });
  it('is ignored when the controller has no rumble motors', async () => {
    vi.useFakeTimers();
    const { loop, writes } = await rumbleRig(false);
    loop.testRumble(1, 1, 500);
    await vi.advanceTimersByTimeAsync(300);
    for (const w of writes) {
      expect(w[3]).toBe(0);
      expect(w[4]).toBe(0);
    }
    await loop.stop();
    vi.useRealTimers();
  });
  it('turning hasRumble off ends a running test pulse at once', async () => {
    vi.useFakeTimers();
    const { loop, writes } = await rumbleRig(true);
    loop.testRumble(0.8, 0.8, 2000);
    expect(writes.at(-1)![4]).toBe(204);
    loop.setSettings({ ...defaultSettings(), hasRumble: false });
    expect([writes.at(-1)![4], writes.at(-1)![3]]).toEqual([0, 0]);
    await loop.stop();
    vi.useRealTimers();
  });
});

describe('engine loop snapshot: input source and touchpad', () => {
  it.each(['device', 'replay'] as const)(
    'a %s source tags its snapshots and carries the touch points',
    async (kind) => {
      vi.useFakeTimers();
      let t = 1000;
      const events: EngineEvent[] = [];
      let report!: (b: Uint8Array, t: number) => void;
      const src: InputSource = {
        kind,
        start(r, st) {
          report = r;
          st(true);
        },
        async write() {},
        async stop() {},
      };
      const loop = createEngineLoop({
        source: src,
        sink: fakeSink(),
        emit: (e) => events.push(e),
        now: () => t,
        allowInject: false,
      });
      loop.setProfile(defaultProfile('p', 'p'));
      await loop.start();
      const b = usbReport(false);
      b[33] = 0x05;
      b[34] = 0x7f;
      b[35] = 0x37;
      b[36] = 0x21; // finger id 5 down at (1919, 531)
      b[37] = 0x80; // second slot: no finger
      t += 20;
      report(b, t);
      const snaps = events.filter((e) => e.type === 'snapshot');
      const snap = EngineSnapshotSchema.parse(snaps.at(-1)!.snapshot);
      expect(snap.source).toBe(kind);
      expect(snap.raw.touch).toEqual([
        { active: true, id: 5, x: 1919, y: 531 },
        { active: false, id: 0, x: 0, y: 0 },
      ]);
      await loop.stop();
      vi.useRealTimers();
    },
  );
  it('a disconnected snapshot has no fingers down', async () => {
    vi.useFakeTimers();
    const events: EngineEvent[] = [];
    const src: InputSource = {
      kind: 'device',
      start(_r, st) {
        st(false);
      },
      async write() {},
      async stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink: fakeSink(),
      emit: (e) => events.push(e),
      now: () => 1000,
      allowInject: false,
    });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    const snap = events.filter((e) => e.type === 'snapshot').at(-1)!.snapshot;
    expect(snap.raw.touch).toEqual([]);
    expect(snap.source).toBe('device');
    await loop.stop();
    vi.useRealTimers();
  });
});
