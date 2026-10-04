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
});
