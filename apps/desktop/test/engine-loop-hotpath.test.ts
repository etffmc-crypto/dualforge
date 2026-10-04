import { describe, expect, it, vi } from 'vitest';
import { defaultProfile, type Profile, type XInputState } from '@dualforge/shared';
import type * as EngineModule from '@dualforge/engine';
import { createEngineLoop, type InputSource, type PadSink } from '../src/main/engine-loop.js';

const built = vi.hoisted(() => ({ count: 0 }));
vi.mock('@dualforge/engine', async (orig) => {
  const m = await orig<typeof EngineModule>();
  return {
    ...m,
    buildOutputReport: (...a: Parameters<typeof m.buildOutputReport>) => {
      built.count++;
      return m.buildOutputReport(...a);
    },
  };
});

function sink(): PadSink & { frames: XInputState[] } {
  const frames: XInputState[] = [];
  return {
    ready: true,
    frames,
    async connect() {},
    update(x: XInputState) {
      frames.push(structuredClone(x));
    },
    onRumble() {},
    disconnect() {},
  };
}
function report(opts: { cross?: boolean; gyroY?: number } = {}): Uint8Array {
  const b = new Uint8Array(64);
  b[0] = 0x01;
  b[1] = b[2] = b[3] = b[4] = 128;
  if (opts.cross) b[8] = 0x20;
  new DataView(b.buffer).setInt16(18, opts.gyroY ?? 0, true);
  return b;
}
async function rig(p: Profile) {
  let clock = 1000;
  let push!: (b: Uint8Array, t: number) => void;
  const writes: Uint8Array[] = [];
  const moves: number[][] = [];
  const src: InputSource = {
    kind: 'device',
    start(r, st) {
      push = r;
      st(true);
    },
    async write(r) {
      writes.push(r);
    },
    async stop() {},
  };
  const s = sink();
  const loop = createEngineLoop({
    source: src,
    sink: s,
    emit: () => {},
    now: () => clock,
    allowInject: true,
    injector: { key() {}, mouse() {}, move: (dx, dy) => moves.push([dx, dy]) },
  });
  loop.setProfile(p);
  await loop.start();
  return {
    loop,
    writes,
    moves,
    sink: s,
    advance: (ms: number) => (clock += ms),
    send: (b: Uint8Array) => push(b, clock),
  };
}

describe('engine loop hot path', () => {
  it('rebuilds/writes the output report only when dirty or the keepalive is due', async () => {
    vi.useFakeTimers();
    const r = await rig(defaultProfile('p', 'p'));
    await vi.advanceTimersByTimeAsync(0);
    const builtBefore = built.count;
    const writesBefore = r.writes.length;
    for (let i = 0; i < 1000; i++) {
      r.advance(0.5); // 500 ms of 2 kHz reports, nothing changing
      r.send(report());
    }
    const keepalives = Math.ceil(500 / 250) + 1;
    expect(r.writes.length - writesBefore).toBeLessThanOrEqual(keepalives);
    expect(built.count - builtBefore).toBeLessThanOrEqual(keepalives);
    await r.loop.stop();
    vi.useRealTimers();
  });
  it('a settings change still writes immediately', async () => {
    vi.useFakeTimers();
    const r = await rig(defaultProfile('p', 'p'));
    r.advance(1);
    r.send(report());
    const n = r.writes.length;
    const p = defaultProfile('p', 'p');
    p.lights = { ...p.lights, mode: 'static', r: 1, g: 2, b: 3 };
    r.loop.setProfile(p);
    r.advance(1);
    r.send(report());
    expect(r.writes.length).toBe(n + 1);
    await r.loop.stop();
    vi.useRealTimers();
  });
  it('coalesces gyro mouse moves to at most one injected move per millisecond', async () => {
    vi.useFakeTimers();
    const p = defaultProfile('p', 'p');
    p.gyro = { ...p.gyro, output: 'mouse', activate: 'always', deadzoneDps: 0, sensitivityX: 20 };
    const r = await rig(p);
    r.loop.setUiFocused(false);
    for (let i = 0; i < 80; i++) {
      r.advance(0.125); // 8 kHz for 10 ms
      r.send(report({ gyroY: -8192 })); // ~500 dps turning right
    }
    expect(r.moves.length).toBeGreaterThan(0);
    expect(r.moves.length).toBeLessThanOrEqual(11);
    await r.loop.stop();
    vi.useRealTimers();
  });
  it('resets the gyro toggle latch when gyro.activate changes on setProfile', async () => {
    vi.useFakeTimers();
    const toggle = defaultProfile('p', 'p');
    toggle.gyro = {
      ...toggle.gyro,
      output: 'rightStick',
      activate: 'toggle',
      activateButton: 'cross',
      deadzoneDps: 0,
    };
    const r = await rig(toggle);
    r.advance(1);
    r.send(report({ cross: true, gyroY: -1638 })); // toggles on
    r.advance(1);
    r.send(report({ gyroY: -1638 }));
    expect(r.sink.frames.at(-1)!.rx).toBeGreaterThan(0);
    // same activation mode: latch survives
    r.loop.setProfile({ ...toggle, name: 'renamed' });
    r.advance(1);
    r.send(report({ gyroY: -1638 }));
    expect(r.sink.frames.at(-1)!.rx).toBeGreaterThan(0);
    // different mode and back: latch cleared
    const always = { ...toggle, gyro: { ...toggle.gyro, activate: 'always' as const } };
    r.loop.setProfile(always);
    r.loop.setProfile(toggle);
    r.advance(1);
    r.send(report({ gyroY: -1638 }));
    expect(r.sink.frames.at(-1)!.rx).toBe(0);
    await r.loop.stop();
    vi.useRealTimers();
  });
});
