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
    const p = defaultProfile('p', 'p'); p.triggers.right.hairTrigger = { mode: 'fixed' };
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
  it('runs mappings after axes so a later axis target can override (order guard)', () => {
    // With default mappings nothing overrides; assert axes survive mapping stage.
    const p = compileProfile(defaultProfile('p', 'p'));
    const o = processReport(parseDualSenseUsb(report((b) => { b[1] = 255; b[9] = 0x01; })), p, createPipelineState(), 0);
    expect(o.xinput.lx).toBeCloseTo(1, 2);
    expect(o.xinput.buttons.LB).toBe(true);
  });
});
