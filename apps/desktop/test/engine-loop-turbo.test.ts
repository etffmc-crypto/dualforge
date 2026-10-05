import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultProfile,
  defaultSettings,
  type EngineEvent,
  type Profile,
  type XInputState,
} from '@dualforge/shared';
import { createEngineLoop, type InputSource, type PadSink } from '../src/main/engine-loop.js';

function fakeSink(): PadSink & { frames: XInputState[] } {
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
/** A USB input report with the d-pad neutral and the given buttons down. */
function usb(o: { cross?: boolean; touchpad?: boolean } = {}): Uint8Array {
  const b = new Uint8Array(64);
  b[0] = 0x01;
  b[1] = b[2] = b[3] = b[4] = 128;
  b[8] = 0x08 | (o.cross ? 0x20 : 0);
  b[10] = o.touchpad ? 0x02 : 0;
  return b;
}

async function rig(kind: 'device' | 'replay' = 'device', profile?: Profile) {
  let t = 1000;
  const events: EngineEvent[] = [];
  const writes: Uint8Array[] = [];
  const sink = fakeSink();
  let report!: (b: Uint8Array, t: number) => void;
  const src: InputSource = {
    kind,
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
    sink,
    emit: (e) => events.push(e),
    now: () => t,
    allowInject: false,
  });
  loop.setSettings(defaultSettings());
  loop.setProfile(profile ?? defaultProfile('p1', 'P1'));
  await loop.start();
  return {
    loop,
    events,
    writes,
    sink,
    /** Feeds one report `dt` ms after the previous one; returns the virtual pad A state. */
    send(o: Parameters<typeof usb>[0], dt = 20) {
      t += dt;
      report(usb(o), t);
      return sink.frames.at(-1)!.buttons.A;
    },
    edits: () => events.filter((e) => e.type === 'profileEdit'),
    lastSnap: () => {
      const s = events.filter((e) => e.type === 'snapshot').at(-1);
      return s?.type === 'snapshot' ? s.snapshot : null;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('engine loop turbo', () => {
  it('the on-pad combo emits profileEdit and applies it locally, so the next combo keeps cycling', async () => {
    const r = await rig();
    r.send({ touchpad: true });
    expect(r.send({ touchpad: true, cross: true })).toBe(false);
    r.send({ touchpad: true });
    r.send({ touchpad: true, cross: true });
    expect(r.edits()).toEqual([
      {
        type: 'profileEdit',
        profileId: 'p1',
        edits: [{ button: 'cross', turbo: { mode: 'hold', hz: 8 } }],
      },
      {
        type: 'profileEdit',
        profileId: 'p1',
        edits: [{ button: 'cross', turbo: { mode: 'hold', hz: 12 } }],
      },
    ]);
    await r.loop.stop();
  });
  it('a replay never edits the profile', async () => {
    const r = await rig('replay');
    r.send({ touchpad: true });
    r.send({ touchpad: true, cross: true });
    expect(r.edits()).toEqual([]);
    await r.loop.stop();
  });
  it('settings.turbo reaches the mapping stage: modeButton null makes touchpad + cross a plain press', async () => {
    const r = await rig();
    r.loop.setSettings({
      ...defaultSettings(),
      turbo: { ...defaultSettings().turbo, modeButton: null },
    });
    r.send({ touchpad: true });
    expect(r.send({ touchpad: true, cross: true })).toBe(true);
    expect(r.edits()).toEqual([]);
    await r.loop.stop();
  });
  it('snapshots carry turboConfigured and turboActive', async () => {
    const p = defaultProfile('p1', 'P1');
    p.mappings.cross!.turbo = { mode: 'hold', hz: 10 };
    const r = await rig('device', p);
    r.send({});
    expect(r.lastSnap()).toMatchObject({ turboConfigured: true, turboActive: false });
    r.send({ cross: true });
    expect(r.lastSnap()).toMatchObject({ turboConfigured: true, turboActive: true });
    r.loop.setProfile(defaultProfile('p1', 'P1'));
    r.send({ cross: true });
    expect(r.lastSnap()).toMatchObject({ turboConfigured: false, turboActive: false });
    await r.loop.stop();
  });
  it('a toggle latch survives a speed-only profile edit and stops when the mode changes', async () => {
    const p = defaultProfile('p1', 'P1');
    p.mappings.cross!.turbo = { mode: 'toggle', hz: 10 };
    const r = await rig('device', p);
    r.send({ cross: true });
    r.send({});
    const faster = structuredClone(p);
    faster.mappings.cross!.turbo = { mode: 'toggle', hz: 5 };
    r.loop.setProfile(faster);
    const fired = Array.from({ length: 20 }, () => r.send({}, 10));
    expect(fired.some(Boolean)).toBe(true); // still auto-firing
    const hold = structuredClone(p);
    hold.mappings.cross!.turbo = { mode: 'hold', hz: 10 };
    r.loop.setProfile(hold);
    expect(Array.from({ length: 20 }, () => r.send({}, 10)).some(Boolean)).toBe(false);
    await r.loop.stop();
  });
  it('the lightbar pulses red while turbo is set, unless the pulse is switched off', async () => {
    const p = defaultProfile('p1', 'P1');
    p.mappings.cross!.turbo = { mode: 'hold', hz: 10 };
    const r = await rig('device', p);
    r.writes.length = 0;
    for (let i = 0; i < 30; i++) r.send({}, 20); // 600 ms of reports
    await vi.advanceTimersByTimeAsync(600);
    const colours = r.writes.map((w) => [w[45]!, w[46]!, w[47]!]);
    expect(colours.every(([, g, b]) => g === 0 && b === 0)).toBe(true);
    expect(new Set(colours.map(([red]) => red)).size).toBeGreaterThanOrEqual(2);

    r.loop.setSettings({
      ...defaultSettings(),
      turbo: { ...defaultSettings().turbo, lightbarPulse: false },
    });
    const w = r.writes.at(-1)!;
    expect([w[45], w[46], w[47]]).toEqual([p.lights.r, p.lights.g, p.lights.b]);
    await r.loop.stop();
  });
  it('no pulse without any turbo set', async () => {
    const r = await rig();
    r.send({});
    const w = r.writes.at(-1)!;
    const d = defaultProfile('p1', 'P1').lights;
    expect([w[45], w[46], w[47]]).toEqual([d.r, d.g, d.b]);
    await r.loop.stop();
  });
});
