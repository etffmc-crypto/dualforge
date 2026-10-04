import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { compileProfile, LUT_SIZE } from '../src/compile.js';
import { evaluateCurve, evaluateLut, presetPoints } from '../src/stages/stick-curve.js';

describe('compileProfile', () => {
  it('builds LUTs matching evaluateCurve within 1/255 for every preset', () => {
    for (const preset of ['linear', 'aggressive', 'precise', 'scurve'] as const) {
      const p = defaultProfile('p', 'p');
      p.sticks.left.curve = { kind: 'preset', preset };
      const c = compileProfile(p);
      expect(c.left.lut.length).toBe(LUT_SIZE + 1);
      for (let i = 0; i <= 100; i++) {
        const v = i / 100;
        expect(
          Math.abs(evaluateLut(c.left.lut, v) - evaluateCurve(presetPoints(preset), v)),
        ).toBeLessThan(1 / 255);
      }
    }
  });
  it('custom curve LUT holds past the last point', () => {
    const p = defaultProfile('p', 'p');
    p.sticks.right.curve = {
      kind: 'custom',
      points: [
        [0.1, 0.1],
        [0.2, 0.2],
        [0.3, 0.3],
        [0.4, 0.4],
        [0.5, 0.9],
        [0.5, 0.9],
        [0.5, 0.9],
        [0.5, 0.9],
      ],
    };
    expect(evaluateLut(compileProfile(p).right.lut, 0.95)).toBeCloseTo(0.9, 3);
  });
  it('trigger LUT follows trigger curve preset', () => {
    const p = defaultProfile('p', 'p');
    p.triggers.left.curve = 'precise';
    expect(evaluateLut(compileProfile(p).lt.lut, 0.5)).toBeLessThan(0.5);
  });
});
