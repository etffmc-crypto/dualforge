import { describe, expect, it } from 'vitest';
import { defaultProfile, emptyButtons, type RawState } from '@dualforge/shared';
import { applyMappings, createMappingState } from '../../src/stages/mapping.js';

const raw = (pressed: string[] = []): RawState => {
  const buttons = emptyButtons();
  for (const p of pressed) (buttons as Record<string, boolean>)[p] = true;
  return { lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, buttons,
    gyro: { x: 0, y: 0, z: 0 }, accel: { x: 0, y: 0, z: 0 },
    touch: [{ active: false, id: 0, x: 0, y: 0 }, { active: false, id: 0, x: 0, y: 0 }],
    battery: { percent: 100, state: 'full' }, seq: 0 };
};

describe('applyMappings', () => {
  it('default profile maps cross→A, options→START, dpad', () => {
    const p = defaultProfile('p', 'p');
    const o = applyMappings(raw(['cross', 'options', 'dpadLeft']), p, createMappingState(), 0);
    expect(o.xinput.buttons.A).toBe(true);
    expect(o.xinput.buttons.START).toBe(true);
    expect(o.xinput.buttons.DPAD_LEFT).toBe(true);
    expect(o.xinput.buttons.B).toBe(false);
  });
  it('multi-map presses all targets', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross = { targets: [{ type: 'xbutton', button: 'A' }, { type: 'xbutton', button: 'X' }], turboHz: 0, continuous: false };
    const o = applyMappings(raw(['cross']), p, createMappingState(), 0);
    expect(o.xinput.buttons.A && o.xinput.buttons.X).toBe(true);
  });
  it('emits key down/up only on transitions', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.square = { targets: [{ type: 'key', code: 'VK_SPACE' }], turboHz: 0, continuous: false };
    const s = createMappingState();
    expect(applyMappings(raw(['square']), p, s, 0).keys).toEqual([{ code: 'VK_SPACE', down: true }]);
    expect(applyMappings(raw(['square']), p, s, 1).keys).toEqual([]);
    expect(applyMappings(raw([]), p, s, 2).keys).toEqual([{ code: 'VK_SPACE', down: false }]);
  });
  it('turbo toggles at the configured frequency', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross = { targets: [{ type: 'xbutton', button: 'A' }], turboHz: 10, continuous: false }; // 100 ms period
    const s = createMappingState();
    expect(applyMappings(raw(['cross']), p, s, 0).xinput.buttons.A).toBe(true);
    expect(applyMappings(raw(['cross']), p, s, 60).xinput.buttons.A).toBe(false);
    expect(applyMappings(raw(['cross']), p, s, 110).xinput.buttons.A).toBe(true);
  });
  it('mouse targets emit transitions', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.r1 = { targets: [{ type: 'mouse', button: 'left' }], turboHz: 0, continuous: false };
    const s = createMappingState();
    expect(applyMappings(raw(['r1']), p, s, 0).mouse).toEqual([{ button: 'left', down: true }]);
  });
});
