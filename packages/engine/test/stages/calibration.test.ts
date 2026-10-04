import { describe, expect, it } from 'vitest';
import {
  assessRest,
  computeCenter,
  computeRadius,
  computeRadiusFromReach,
} from '../../src/stages/calibration.js';

describe('calibration', () => {
  it('center is the mean', () =>
    expect(
      computeCenter([
        { x: 0.1, y: -0.1 },
        { x: 0.3, y: 0.1 },
      ]),
    ).toEqual({ cx: 0.2, cy: 0 }));
  it('radius is the 95th percentile magnitude from center, clamped', () => {
    const pts = Array.from({ length: 100 }, (_, i) => {
      const a = (i / 100) * Math.PI * 2;
      return { x: 0.9 * Math.cos(a), y: 0.9 * Math.sin(a) };
    });
    pts.push({ x: 2, y: 2 }); // outlier
    expect(computeRadius(pts, { cx: 0, cy: 0 })).toBeCloseTo(0.9, 2);
    expect(computeRadius([{ x: 0.1, y: 0 }], { cx: 0, cy: 0 })).toBe(0.5);
  });
  it('assessRest accepts a still, centred stick', () => {
    const r = assessRest([
      { x: 0.01, y: 0 },
      { x: 0.012, y: 0.001 },
      { x: 0.009, y: -0.001 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.reason).toBeUndefined();
  });
  it('assessRest flags an off-center rest', () => {
    const r = assessRest(Array.from({ length: 20 }, () => ({ x: 0.3, y: 0 })));
    expect(r).toMatchObject({ ok: false, reason: 'off-center' });
  });
  it('assessRest flags a moving stick', () => {
    const r = assessRest(Array.from({ length: 20 }, (_, i) => ({ x: i % 2 ? 0.12 : 0, y: 0 })));
    expect(r).toMatchObject({ ok: false, reason: 'moving' });
    expect(r.spread).toBeCloseTo(0.06, 3);
  });
  it('radius from reach is the median, so diagonal overshoot does not inflate it', () => {
    const reach = Array.from({ length: 36 }, (_, i) =>
      i % 9 === 0 ? 0.95 : i % 9 === 4 || i % 9 === 5 ? 1.2 : 0.95,
    );
    const diag = Array.from({ length: 36 }, (_, i) => (i % 9 === 4 ? 1.2 : 0.95));
    expect(computeRadiusFromReach(reach)).toBeCloseTo(0.95, 2);
    expect(computeRadiusFromReach(diag)).toBeCloseTo(0.95, 2);
    expect(computeRadiusFromReach(diag)).toBeLessThan(1.0);
  });
  it('radius from reach is 1 when fewer than 8 sectors were reached', () => {
    expect(computeRadiusFromReach([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, ...Array(29).fill(0)])).toBe(
      1,
    );
  });
});
