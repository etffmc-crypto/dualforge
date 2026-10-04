import { describe, expect, it } from 'vitest';
import { computeCenter, computeRadius } from '../../src/stages/calibration.js';

describe('calibration', () => {
  it('center is the mean', () => expect(computeCenter([{ x: 0.1, y: -0.1 }, { x: 0.3, y: 0.1 }])).toEqual({ cx: 0.2, cy: 0 }));
  it('radius is the 95th percentile magnitude from center, clamped', () => {
    const pts = Array.from({ length: 100 }, (_, i) => { const a = (i / 100) * Math.PI * 2; return { x: 0.9 * Math.cos(a), y: 0.9 * Math.sin(a) }; });
    pts.push({ x: 2, y: 2 }); // outlier
    expect(computeRadius(pts, { cx: 0, cy: 0 })).toBeCloseTo(0.9, 2);
    expect(computeRadius([{ x: 0.1, y: 0 }], { cx: 0, cy: 0 })).toBe(0.5);
  });
});
