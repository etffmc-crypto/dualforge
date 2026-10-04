import { describe, expect, it } from 'vitest';
import { applyStickCurve, evaluateCurve, presetPoints } from '../../src/stages/stick-curve.js';

describe('evaluateCurve', () => {
  const linear = presetPoints('linear');
  it('linear preset is identity', () => {
    for (const v of [0, 0.25, 0.5, 0.75, 1]) expect(evaluateCurve(linear, v)).toBeCloseTo(v, 6);
  });
  it('interpolates between points', () => {
    const pts: [number, number][] = [[0.1, 0], [0.2, 0.1], [0.3, 0.2], [0.4, 0.3], [0.5, 1], [0.6, 1], [0.8, 1], [1, 1]];
    expect(evaluateCurve(pts, 0.45)).toBeCloseTo(0.65, 6);
    expect(evaluateCurve(pts, 0.05)).toBeCloseTo(0, 6);
  });
  it('holds last output past final point', () => {
    const pts: [number, number][] = [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3], [0.4, 0.4], [0.5, 0.9], [0.5, 0.9], [0.5, 0.9], [0.5, 0.9]];
    expect(evaluateCurve(pts, 0.9)).toBeCloseTo(0.9, 6);
  });
  it('presets are monotone and end at 1', () => {
    for (const p of ['aggressive', 'precise', 'scurve'] as const) {
      const pts = presetPoints(p);
      let last = 0;
      for (const [, o] of pts) { expect(o).toBeGreaterThanOrEqual(last); last = o; }
      expect(evaluateCurve(pts, 1)).toBeCloseTo(1, 6);
    }
  });
  it('aggressive > linear > precise mid-travel', () => {
    expect(evaluateCurve(presetPoints('aggressive'), 0.5)).toBeGreaterThan(0.5);
    expect(evaluateCurve(presetPoints('precise'), 0.5)).toBeLessThan(0.5);
  });
});

describe('applyStickCurve', () => {
  it('keeps angle, scales magnitude', () => {
    const o = applyStickCurve(0.3, 0.4, { kind: 'preset', preset: 'aggressive' });
    expect(o.x / o.y).toBeCloseTo(0.75, 6);
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(evaluateCurve(presetPoints('aggressive'), 0.5), 6);
  });
  it('zero stays zero', () => expect(applyStickCurve(0, 0, { kind: 'preset', preset: 'scurve' })).toEqual({ x: 0, y: 0 }));
});
