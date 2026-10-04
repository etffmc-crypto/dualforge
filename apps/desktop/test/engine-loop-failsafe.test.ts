import { describe, expect, it, vi } from 'vitest';
import { defaultProfile, type XInputState } from '@dualforge/shared';
import type * as Engine from '@dualforge/engine';
import { createEngineLoop, type InputSource, type PadSink } from '../src/main/engine-loop.js';

const hook = vi.hoisted(() => ({ throwOnce: false }));
vi.mock('@dualforge/engine', async (orig) => {
  const actual = await orig<typeof Engine>();
  return { ...actual, processReport: (...a: Parameters<typeof actual.processReport>) => {
    if (hook.throwOnce) { hook.throwOnce = false; throw new Error('boom'); }
    return actual.processReport(...a);
  } };
});

function usbReport(cross: boolean): Uint8Array {
  const b = new Uint8Array(64);
  b[0] = 0x01; b[1] = b[2] = b[3] = b[4] = 128;
  if (cross) b[8] = 0x20;
  return b;
}

describe('engine loop fail-safe', () => {
  async function rig() {
    const calls: string[] = []; const frames: XInputState[] = []; const events: { type: string; code?: string }[] = [];
    const injector = { key: (c: string, d: boolean) => calls.push(`key ${c} ${d ? 'down' : 'up'}`), mouse: () => {}, move: () => {} };
    const sink: PadSink = { ready: true, async connect() {}, update: (x) => frames.push(structuredClone(x)), onRumble() {}, disconnect() {} };
    let report!: (b: Uint8Array, t: number) => void;
    const src: InputSource = { kind: 'device', start(r, st) { report = r; st(true); }, async write() {}, async stop() {} };
    const loop = createEngineLoop({ source: src, sink, emit: (e) => events.push(e as never), now: () => performance.now(), injector });
    const p = defaultProfile('p', 'p');
    p.mappings.cross = { targets: [{ type: 'key', code: 'VK_SPACE' }], turboHz: 0, continuous: false };
    loop.setProfile(p);
    await loop.start(); loop.setUiFocused(false);
    return { calls, frames, events, loop, report: (b: Uint8Array) => report(b, performance.now()) };
  }
  it('a throwing pipeline releases held input, emits E_PIPELINE and keeps processing', async () => {
    vi.useFakeTimers();
    const { calls, frames, events, loop, report } = await rig();
    report(usbReport(true));
    expect(calls).toEqual(['key VK_SPACE down']);
    hook.throwOnce = true;
    expect(() => report(usbReport(true))).not.toThrow();
    expect(calls).toEqual(['key VK_SPACE down', 'key VK_SPACE up']);
    expect(events.find((e) => e.type === 'error')?.code).toBe('E_PIPELINE');
    expect(frames.at(-1)!.buttons.A).toBe(false);
    report(usbReport(true));                      // still processed afterwards; key pressed again
    expect(calls.at(-1)).toBe('key VK_SPACE down');
    await loop.stop(); vi.useRealTimers();
  });
  it('releaseAll() releases held keys synchronously and neutralizes the sink', async () => {
    vi.useFakeTimers();
    const { calls, frames, loop, report } = await rig();
    report(usbReport(true));
    loop.releaseAll();
    expect(calls).toEqual(['key VK_SPACE down', 'key VK_SPACE up']);
    expect(frames.at(-1)!.buttons.A).toBe(false);
    await loop.stop(); vi.useRealTimers();
  });
});
