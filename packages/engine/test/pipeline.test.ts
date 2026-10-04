import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { parseDualSenseUsb } from '../src/codec/parse-input.js';
import { compileProfile } from '../src/compile.js';
import { createPipelineState, processReport } from '../src/pipeline.js';

function report(mut: (b: Uint8Array) => void): Uint8Array {
  const b = new Uint8Array(64); b[0] = 1; b[1] = b[2] = b[3] = b[4] = 128; b[8] = 8; mut(b); return b;
}

describe('processReport', () => {
  it('passes a full-right left stick through to xinput', () => {
    const p = defaultProfile('p', 'p');
    const o = processReport(parseDualSenseUsb(report((b) => { b[1] = 255; })), compileProfile(p), createPipelineState(), 0);
    expect(o.xinput.lx).toBeCloseTo(1, 2);
    expect(o.xinput.ly).toBeCloseTo(0, 2);
  });
  it('applies trigger stage to analog triggers', () => {
    const p = defaultProfile('p', 'p'); p.triggers.right.hairTrigger = { mode: 'fixed' }; p.triggers.right.digital = false;
    const o = processReport(parseDualSenseUsb(report((b) => { b[6] = 30; })), compileProfile(p), createPipelineState(), 0);
    expect(o.xinput.rt).toBe(1);
  });
  it('small jitter inside deadzone yields exact zero', () => {
    const p = defaultProfile('p', 'p');
    const o = processReport(parseDualSenseUsb(report((b) => { b[3] = 131; b[4] = 125; })), compileProfile(p), createPipelineState(), 0);
    expect(o.xinput.rx).toBe(0); expect(o.xinput.ry).toBe(0);
  });
  it('maps buttons via mapping stage', () => {
    const p = defaultProfile('p', 'p');
    const o = processReport(parseDualSenseUsb(report((b) => { b[9] = 0x01; })), compileProfile(p), createPipelineState(), 0);
    expect(o.xinput.buttons.LB).toBe(true);
  });
  // Stage order (sticks -> triggers -> mappings last) becomes observable in Plan 3, when button->axis
  // targets can override stick output; until then default mappings cannot conflict with axes.
  it('button and stick output coexist in one frame', () => {
    const p = compileProfile(defaultProfile('p', 'p'));
    const o = processReport(parseDualSenseUsb(report((b) => { b[1] = 255; b[8] = 0x28; })), p, createPipelineState(), 0);
    expect(o.xinput.buttons.A).toBe(true);
    expect(o.xinput.lx).toBeCloseTo(1, 2);
  });
  it('digital trigger: l2 click (byte 9 bit 2) drives lt to 1 via the xtrigger mapping; analog is ignored', () => {
    const o = processReport(parseDualSenseUsb(report((b) => { b[9] = 0x04; b[5] = 255; })), compileProfile(defaultProfile('p', 'p')), createPipelineState(), 0);
    expect(o.xinput.lt).toBe(1);
    const o2 = processReport(parseDualSenseUsb(report((b) => { b[5] = 255; })), compileProfile(defaultProfile('p', 'p')), createPipelineState(), 0);
    expect(o2.xinput.lt).toBe(0);
  });
  it('anti-deadzone is applied after the curve: precise curve + anti 0.3 still yields >= 0.3', () => {
    const p = defaultProfile('p', 'p');
    p.sticks.left.deadzone = { center: 0.05, anti: 0.3, outer: 0 };
    p.sticks.left.curve = { kind: 'preset', preset: 'precise' };
    const o = processReport(parseDualSenseUsb(report((b) => { b[1] = 128 + 10; })), compileProfile(p), createPipelineState(), 0);
    expect(Math.hypot(o.xinput.lx, o.xinput.ly)).toBeGreaterThanOrEqual(0.3);
  });
  it('mapping keeps the stick axes (pre-filled xinput)', () => {
    const o = processReport(parseDualSenseUsb(report((b) => { b[1] = 255; b[9] = 0x04; })), compileProfile(defaultProfile('p', 'p')), createPipelineState(), 0);
    expect(o.xinput.lx).toBeCloseTo(1, 2);
    expect(o.xinput.lt).toBe(1);
  });
  it('macro-driven key emits down at start and up after the hold, via the pipeline', () => {
    const p = defaultProfile('p', 'p');
    p.macros = [{ id: 'm', name: 'm', loop: false, steps: [{ target: { type: 'key', code: 'VK_Q' }, holdMs: 100, delayMs: 0 }] }];
    p.mappings.triangle = { targets: [{ type: 'macro', macroId: 'm' }], turboHz: 0, continuous: false };
    const cp = compileProfile(p); const s = createPipelineState();
    const press = parseDualSenseUsb(report((b) => { b[8] = 0x88; })); // triangle
    const idle = parseDualSenseUsb(report(() => {}));
    expect(processReport(press, cp, s, 0).keys).toEqual([{ code: 'VK_Q', down: true }]);
    expect(processReport(idle, cp, s, 50).keys).toEqual([]);     // button released, macro keeps running
    expect(processReport(idle, cp, s, 100).keys).toEqual([{ code: 'VK_Q', down: false }]);
    expect(processReport(press, cp, s, 120).keys).toEqual([{ code: 'VK_Q', down: true }]);
  });
  it('holding the macro button does not re-trigger it', () => {
    const p = defaultProfile('p', 'p');
    p.macros = [{ id: 'm', name: 'm', loop: false, steps: [{ target: { type: 'key', code: 'VK_Q' }, holdMs: 100, delayMs: 0 }] }];
    p.mappings.triangle = { targets: [{ type: 'macro', macroId: 'm' }], turboHz: 0, continuous: false };
    const cp = compileProfile(p); const s = createPipelineState();
    const press = parseDualSenseUsb(report((b) => { b[8] = 0x88; }));
    processReport(press, cp, s, 0);
    expect(processReport(press, cp, s, 100).keys).toEqual([{ code: 'VK_Q', down: false }]);
    expect(processReport(press, cp, s, 150).keys).toEqual([]);
  });
  it('gyro rightStick adds to the processed right stick and clamps to the unit circle', () => {
    const p = defaultProfile('p', 'p'); p.gyro.output = 'rightStick'; p.gyro.deadzoneDps = 0;
    const cp = compileProfile(p);
    const withGyro = (rxByte: number, yawLsb: number) => {
      const b = report((bb) => { bb[3] = rxByte; });
      const raw = parseDualSenseUsb(b); raw.gyro.y = yawLsb;
      return processReport(raw, cp, createPipelineState(), 0);
    };
    expect(withGyro(128, -100 * 16.384).xinput.rx).toBeCloseTo(0.5, 2);
    const o = withGyro(255, -200 * 16.384);
    expect(Math.hypot(o.xinput.rx, o.xinput.ry)).toBeLessThanOrEqual(1.0000001);
  });
  it('gyro mouse sets mouseMove and leaves the right stick alone', () => {
    const p = defaultProfile('p', 'p'); p.gyro.output = 'mouse'; p.gyro.deadzoneDps = 0;
    const raw = parseDualSenseUsb(report(() => {})); raw.gyro.y = -100 * 16.384;
    const o = processReport(raw, compileProfile(p), createPipelineState(), 10);   // first frame dt = 1 ms
    expect(o.xinput.rx).toBe(0);
    const s = createPipelineState(); processReport(raw, compileProfile(p), s, 0);
    expect(processReport(raw, compileProfile(p), s, 10).mouseMove.dx).toBe(10);
  });
});
