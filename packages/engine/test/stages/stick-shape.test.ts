import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import {
  applyAntiDeadzone,
  applyRadialDeadzone,
  applyStickShaping,
} from '../../src/stages/stick-shape.js';

const cfg = () => defaultProfile('p', 'p').sticks.left;

describe('applyRadialDeadzone', () => {
  const dz = { center: 0.1, anti: 0.2, outer: 0.1 };
  it('zero inside center deadzone', () => expect(applyRadialDeadzone(0.05, dz)).toBe(0));
  it('one at/after outer deadzone', () => expect(applyRadialDeadzone(0.95, dz)).toBe(1));
  it('rescales linearly between center and outer (anti is applied later, after the curve)', () => {
    // mag 0.5 -> (0.5-0.1)/(0.9-0.1)=0.5; anti no longer applied here
    expect(applyRadialDeadzone(0.5, dz)).toBeCloseTo(0.5, 6);
    expect(applyRadialDeadzone(0.1001, dz)).toBeCloseTo(0, 2);
  });
});

describe('applyAntiDeadzone', () => {
  it('returns the very same object when anti <= 0 (no allocation on the hot path)', () => {
    const p = { x: 0.3, y: 0.4 };
    expect(applyAntiDeadzone(p, 0)).toBe(p);
    expect(applyAntiDeadzone(p, 0.3)).not.toBe(p);
    expect(applyAntiDeadzone(p, 0.3)).toEqual(applyAntiDeadzone(0.3, 0.4, 0.3));
  });
  it('lifts the smallest live magnitude to anti and keeps direction', () => {
    const o = applyAntiDeadzone(0.003, 0.004, 0.3); // mag 0.005
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(0.3 + 0.005 * 0.7, 6);
    expect(o.x / o.y).toBeCloseTo(0.75, 6);
  });
  it('maps full magnitude to 1 and leaves exact zero at zero', () => {
    expect(Math.hypot(...Object.values(applyAntiDeadzone(1, 0, 0.3)))).toBeCloseTo(1, 6);
    expect(applyAntiDeadzone(0, 0, 0.3)).toEqual({ x: 0, y: 0 });
  });
});

describe('applyStickShaping', () => {
  it('centered input stays zero', () =>
    expect(applyStickShaping(0.02, -0.02, cfg())).toEqual({ x: 0, y: 0 }));
  it('preserves angle in circular mode', () => {
    const c = cfg();
    c.deadzone = { center: 0.2, anti: 0, outer: 0 };
    const o = applyStickShaping(0.5, 0.5, c);
    expect(o.x).toBeCloseTo(o.y, 6);
    expect(Math.hypot(o.x, o.y)).toBeCloseTo((Math.hypot(0.5, 0.5) - 0.2) / 0.8, 6);
  });
  it('square mode processes axes independently', () => {
    const c = cfg();
    c.circular = false;
    c.deadzone = { center: 0.2, anti: 0, outer: 0 };
    const o = applyStickShaping(0.1, 0.6, c);
    expect(o.x).toBe(0);
    expect(o.y).toBeCloseTo(0.5, 9); // (0.6-0.2)/0.8 is 0.49999999999999994 in fp
  });
  it('applies calibration center and radius', () => {
    const c = cfg();
    c.calibration = { cx: 0.1, cy: -0.1, radius: 0.9 };
    c.deadzone = { center: 0, anti: 0, outer: 0 };
    const o = applyStickShaping(0.1, -0.1, c);
    expect(o).toEqual({ x: 0, y: 0 });
    expect(applyStickShaping(1, -0.1, c).x).toBeCloseTo(1, 6); // (1-0.1)/0.9 = 1
  });
  it('inverts axes', () => {
    const c = cfg();
    c.invertX = true;
    c.invertY = true;
    c.deadzone = { center: 0, anti: 0, outer: 0 };
    expect(applyStickShaping(0.5, 0.25, c)).toEqual({ x: -0.5, y: -0.25 });
  });
  it('clamps to unit circle when circular', () => {
    const c = cfg();
    c.deadzone = { center: 0, anti: 0, outer: 0 };
    expect(Math.hypot(...Object.values(applyStickShaping(1, 1, c)))).toBeCloseTo(1, 6);
  });
});
