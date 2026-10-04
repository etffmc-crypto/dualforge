import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { entryBytes, parseHidlog } from '../../src/replay/hidlog.js';
import { parseDualSenseUsb } from '../../src/codec/parse-input.js';
import { compileProfile } from '../../src/compile.js';
import { createPipelineState, processReport } from '../../src/pipeline.js';

const log = parseHidlog(
  readFileSync(new URL('../fixtures/stick-sweep.hidlog', import.meta.url), 'utf8'),
);

describe('replay: stick-sweep', () => {
  it('has 201 frames', () => expect(log.length).toBe(201));
  it('left stick traces a near-unit circle after default shaping', () => {
    const p = compileProfile(defaultProfile('p', 'p'));
    const s = createPipelineState();
    const mags = log.map((e) => {
      const o = processReport(parseDualSenseUsb(entryBytes(e)), p, s, e.t);
      return Math.hypot(o.xinput.lx, o.xinput.ly);
    });
    for (const m of mags) expect(m).toBeGreaterThan(0.97);
  });
  it('left trigger ramps monotonically to 1', () => {
    const prof = defaultProfile('p', 'p');
    prof.triggers.left.digital = false; // fixture is an analog ramp
    const p = compileProfile(prof);
    const s = createPipelineState();
    let last = -1;
    for (const e of log) {
      const v = processReport(parseDualSenseUsb(entryBytes(e)), p, s, e.t).xinput.lt;
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    expect(last).toBe(1);
  });
  it('cross pulses map to A pulses', () => {
    const p = compileProfile(defaultProfile('p', 'p'));
    const s = createPipelineState();
    const a = log.map(
      (e) => processReport(parseDualSenseUsb(entryBytes(e)), p, s, e.t).xinput.buttons.A,
    );
    expect(a[0]).toBe(true);
    expect(a[25]).toBe(false);
    expect(a[45]).toBe(true);
  });
});
