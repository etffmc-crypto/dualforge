import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { buildCurveLut, presetPoints } from '../../src/stages/stick-curve.js';
import { applyTrigger, createTriggerState } from '../../src/stages/triggers.js';

const cfg = () => defaultProfile('p', 'p').triggers.left;

describe('applyTrigger', () => {
  it('rescales deadzone window', () => {
    const c = cfg(); c.deadzone = { initial: 0.2, max: 0.8 };
    const s = createTriggerState();
    expect(applyTrigger(0.1, c, buildCurveLut(presetPoints(c.curve)), s)).toBe(0);
    expect(applyTrigger(0.5, c, buildCurveLut(presetPoints(c.curve)), s)).toBeCloseTo(0.5, 6);
    expect(applyTrigger(0.9, c, buildCurveLut(presetPoints(c.curve)), s)).toBe(1);
  });
  it('fixed hair trigger snaps to full', () => {
    const c = cfg(); c.hairTrigger = { mode: 'fixed' };
    expect(applyTrigger(0.05, c, buildCurveLut(presetPoints(c.curve)), createTriggerState())).toBe(1);
    expect(applyTrigger(0.0, c, buildCurveLut(presetPoints(c.curve)), createTriggerState())).toBe(0);
  });
  it('adaptive hair trigger engages at threshold with hysteresis', () => {
    const c = cfg(); c.deadzone = { initial: 0, max: 1 }; c.hairTrigger = { mode: 'adaptive', value: 50 };
    const s = createTriggerState();
    expect(applyTrigger(0.4, c, buildCurveLut(presetPoints(c.curve)), s)).toBeCloseTo(0.4, 6);
    expect(applyTrigger(0.55, c, buildCurveLut(presetPoints(c.curve)), s)).toBe(1);
    expect(applyTrigger(0.45, c, buildCurveLut(presetPoints(c.curve)), s)).toBe(1);        // still engaged (hysteresis)
    expect(applyTrigger(0.3, c, buildCurveLut(presetPoints(c.curve)), s)).toBeCloseTo(0.3, 6);
  });
  it('adaptive hair trigger with low value (5) engages at 0.06 and releases at 0', () => {
    const c = cfg(); c.deadzone = { initial: 0, max: 1 }; c.curve = 'linear'; c.hairTrigger = { mode: 'adaptive', value: 5 };
    const s = createTriggerState();
    expect(applyTrigger(0.06, c, buildCurveLut(presetPoints(c.curve)), s)).toBe(1);
    expect(applyTrigger(0.03, c, buildCurveLut(presetPoints(c.curve)), s)).toBe(1);
    expect(applyTrigger(0, c, buildCurveLut(presetPoints(c.curve)), s)).toBe(0);
  });
  it('adaptive hair trigger with value 100 engages only at 1.0 and releases at <= 0.9', () => {
    const c = cfg(); c.deadzone = { initial: 0, max: 1 }; c.curve = 'linear'; c.hairTrigger = { mode: 'adaptive', value: 100 };
    const s = createTriggerState();
    expect(applyTrigger(0.99, c, buildCurveLut(presetPoints(c.curve)), s)).toBeCloseTo(0.99, 6);
    expect(applyTrigger(1, c, buildCurveLut(presetPoints(c.curve)), s)).toBe(1);
    expect(applyTrigger(0.9, c, buildCurveLut(presetPoints(c.curve)), s)).toBeCloseTo(0.9, 6);
  });
  it('applies curve preset', () => {
    const c = cfg(); c.deadzone = { initial: 0, max: 1 }; c.curve = 'precise';
    expect(applyTrigger(0.5, c, buildCurveLut(presetPoints(c.curve)), createTriggerState())).toBeLessThan(0.5);
  });
});
