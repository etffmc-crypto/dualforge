import { describe, expect, it } from 'vitest';
import { applyStickFilter, createFilterState } from '../../src/stages/stick-filter.js';

const basic = (enabled: boolean, strength: number) => ({
  enabled, mode: 'basic' as const, strength, curve: [[0, 0], [0.1, 0], [0.25, 0], [0.5, 0], [1, 0]] as [number, number][],
});

describe('applyStickFilter', () => {
  it('passes through when disabled', () => {
    const s = createFilterState();
    expect(applyStickFilter(0.7, -0.2, basic(false, 100), s, 1)).toEqual({ x: 0.7, y: -0.2 });
  });
  it('first sample initializes without lag', () => {
    const s = createFilterState();
    expect(applyStickFilter(1, 1, basic(true, 100), s, 1)).toEqual({ x: 1, y: 1 });
  });
  it('smooths a step and converges', () => {
    const s = createFilterState();
    const cfg = basic(true, 100);
    applyStickFilter(0, 0, cfg, s, 1);
    const first = applyStickFilter(1, 0, cfg, s, 1).x;
    expect(first).toBeGreaterThan(0); expect(first).toBeLessThan(0.1);
    let v = first;
    for (let i = 0; i < 1000; i++) v = applyStickFilter(1, 0, cfg, s, 1).x;
    expect(v).toBeCloseTo(1, 3);
  });
  it('lower strength smooths less', () => {
    const a = createFilterState(), b = createFilterState();
    applyStickFilter(0, 0, basic(true, 20), a, 1);
    applyStickFilter(0, 0, basic(true, 80), b, 1);
    expect(applyStickFilter(1, 0, basic(true, 20), a, 1).x)
      .toBeGreaterThan(applyStickFilter(1, 0, basic(true, 80), b, 1).x);
  });
  it('advanced mode uses curve strength by speed: slow moves heavily smoothed, fast moves pass', () => {
    const cfg = { enabled: true, mode: 'advanced' as const, strength: 0, curve: [[0, 100], [0.1, 100], [0.25, 0], [0.5, 0], [1, 0]] as [number, number][] };
    const s2 = createFilterState();
    applyStickFilter(0, 0, cfg, s2, 100);
    const vSlow2 = applyStickFilter(0.01, 0, cfg, s2, 100).x; // speedNorm 0.01 -> strength 100 -> heavy smoothing
    const s3 = createFilterState();
    applyStickFilter(0, 0, cfg, s3, 100);
    const vFast = applyStickFilter(1, 0, cfg, s3, 100).x; // speedNorm 1 -> strength 0 -> pass-through
    expect(vSlow2).toBeLessThan(0.01);
    expect(vFast).toBe(1);
  });
  const adv = { enabled: true, mode: 'advanced' as const, strength: 0, curve: [[0, 100], [0.1, 100], [0.25, 0], [0.5, 0], [1, 0]] as [number, number][] };
  it('advanced mode: 1 LSB jitter (a flip every 5 reports) at 1 ms stays heavily smoothed', () => {
    const s = createFilterState();
    let out = 0, worst = 0;
    for (let i = 0; i < 200; i++) {
      out = applyStickFilter(0.3 + (Math.floor(i / 5) % 2 ? 0.0078 : -0.0078), 0, adv, s, 1).x;
      if (i >= 100) worst = Math.max(worst, Math.abs(out - 0.3));
    }
    expect(worst).toBeLessThan(0.002);
  });
  it('advanced mode: a fast sweep at 1 ms reports is barely smoothed', () => {
    const s = createFilterState();
    applyStickFilter(0, 0, adv, s, 1);
    let out = 0;
    for (let i = 1; i <= 20; i++) out = applyStickFilter(i / 20, 0, adv, s, 1).x;
    expect(out).toBeGreaterThan(0.9);
  });
});
