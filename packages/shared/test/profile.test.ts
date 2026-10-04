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
});
