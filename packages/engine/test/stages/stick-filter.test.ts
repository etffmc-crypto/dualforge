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
});
