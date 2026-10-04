import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { applyTrigger, createTriggerState } from '../../src/stages/triggers.js';

const cfg = () => defaultProfile('p', 'p').triggers.left;

describe('applyTrigger', () => {
  it('rescales deadzone window', () => {
    const c = cfg(); c.deadzone = { initial: 0.2, max: 0.8 };
    const s = createTriggerState();
    expect(applyTrigger(0.1, c, s)).toBe(0);
    expect(applyTrigger(0.5, c, s)).toBeCloseTo(0.5, 6);
    expect(applyTrigger(0.9, c, s)).toBe(1);
  });
  it('fixed hair trigger snaps to full', () => {
    const c = cfg(); c.hairTrigger = { mode: 'fixed' };
    expect(applyTrigger(0.05, c, createTriggerState())).toBe(1);
    expect(applyTrigger(0.0, c, createTriggerState())).toBe(0);
  });
  it('adaptive hair trigger engages at threshold with hysteresis', () => {
    const c = cfg(); c.deadzone = { initial: 0, max: 1 }; c.hairTrigger = { mode: 'adaptive', value: 50 };
    const s = createTriggerState();
    expect(applyTrigger(0.4, c, s)).toBeCloseTo(0.4, 6);
    expect(applyTrigger(0.55, c, s)).toBe(1);
    expect(applyTrigger(0.45, c, s)).toBe(1);        // still engaged (hysteresis)
    expect(applyTrigger(0.3, c, s)).toBeCloseTo(0.3, 6);
  });
  it('applies curve preset', () => {
    const c = cfg(); c.deadzone = { initial: 0, max: 1 }; c.curve = 'precise';
    expect(applyTrigger(0.5, c, createTriggerState())).toBeLessThan(0.5);
  });
});
