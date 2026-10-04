import { describe, expect, it } from 'vitest';
import { applyStickFilter, createFilterState } from '../../src/stages/stick-filter.js';

describe('applyStickFilter', () => {
  it('passes through when disabled', () => {
    const s = createFilterState();
    expect(applyStickFilter(0.7, -0.2, { enabled: false, strength: 100 }, s, 1)).toEqual({ x: 0.7, y: -0.2 });
  });
  it('first sample initializes without lag', () => {
    const s = createFilterState();
    expect(applyStickFilter(1, 1, { enabled: true, strength: 100 }, s, 1)).toEqual({ x: 1, y: 1 });
  });
  it('smooths a step and converges', () => {
    const s = createFilterState();
    const cfg = { enabled: true, strength: 100 };
    applyStickFilter(0, 0, cfg, s, 1);
    const first = applyStickFilter(1, 0, cfg, s, 1).x;
    expect(first).toBeGreaterThan(0); expect(first).toBeLessThan(0.1);
    let v = first;
    for (let i = 0; i < 1000; i++) v = applyStickFilter(1, 0, cfg, s, 1).x;
    expect(v).toBeCloseTo(1, 3);
  });
  it('lower strength smooths less', () => {
    const a = createFilterState(), b = createFilterState();
    applyStickFilter(0, 0, { enabled: true, strength: 20 }, a, 1);
    applyStickFilter(0, 0, { enabled: true, strength: 80 }, b, 1);
    expect(applyStickFilter(1, 0, { enabled: true, strength: 20 }, a, 1).x)
      .toBeGreaterThan(applyStickFilter(1, 0, { enabled: true, strength: 80 }, b, 1).x);
  });
});
