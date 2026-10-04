import { describe, expect, it } from 'vitest';
import { ProfileSchema, defaultProfile, DS_BUTTONS } from '../src/index.js';

describe('profile schema', () => {
  it('default profile validates', () => {
    expect(ProfileSchema.safeParse(defaultProfile('p1', 'Profile 1')).success).toBe(true);
  });
  it('default profile maps every DualSense button', () => {
    const p = defaultProfile('p1', 'Profile 1');
    for (const b of DS_BUTTONS) expect(p.mappings[b]).toBeDefined();
  });
  it('rejects out-of-range deadzone', () => {
    const p = defaultProfile('p1', 'Profile 1');
    p.sticks.left.deadzone.center = 1.5;
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });
  it('fills new fields with defaults for a Plan 1 profile', () => {
    const p = defaultProfile('p', 'p') as unknown as Record<string, unknown>;
    const sticks = (p.sticks as { left: { filter: unknown } }).left;
    sticks.filter = { enabled: false, strength: 0 }; // old shape
    const triggers = (p.triggers as { left: Record<string, unknown> }).left;
    delete triggers.effect;
    const r = ProfileSchema.safeParse(p);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sticks.left.filter.mode).toBe('basic');
      expect(r.data.sticks.left.filter.curve).toHaveLength(5);
      expect(r.data.triggers.left.effect).toEqual({ mode: 'off' });
    }
  });
  it('rejects center deadzone overlapping outer', () => {
    const p = defaultProfile('p', 'p');
    p.sticks.left.deadzone = { center: 0.6, anti: 0, outer: 0.5 };
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });
  it('rejects trigger initial >= max', () => {
    const p = defaultProfile('p', 'p');
    p.triggers.right.deadzone = { initial: 0.9, max: 0.9 };
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });
  it('rejects non-monotone custom curve x', () => {
    const p = defaultProfile('p', 'p');
    p.sticks.left.curve = { kind: 'custom', points: [[0.2, 0.1], [0.1, 0.2], [0.3, 0.3], [0.4, 0.4], [0.5, 0.5], [0.6, 0.6], [0.8, 0.8], [1, 1]] };
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });
  it('accepts each trigger effect mode', () => {
    const p = defaultProfile('p', 'p');
    for (const e of [{ mode: 'resistance', start: 2, force: 6 }, { mode: 'section', start: 2, end: 6, force: 8 }, { mode: 'vibration', frequency: 20, force: 5 }] as const) {
      p.triggers.left.effect = e;
      expect(ProfileSchema.safeParse(p).success).toBe(true);
    }
  });
});
