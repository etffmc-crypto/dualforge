import { describe, expect, it } from 'vitest';
import {
  defaultProfile,
  emptyButtons,
  emptyXInput,
  type Profile,
  type RawState,
  type XInputState,
} from '@dualforge/shared';
import {
  applyMappings as applyMappingsRaw,
  createMappingState,
  diffTransitions,
  type MappingState,
} from '../../src/stages/mapping.js';

// The pipeline diffs transitions after macros; for these tests diff straight away.
const applyMappings = (r: RawState, p: Profile, s: MappingState, t: number, x: XInputState) => {
  const o = applyMappingsRaw(r, p, s, t, x);
  diffTransitions(s.wantKeys, s.wantMouse, s, o);
  return o;
};

const raw = (pressed: string[] = []): RawState => {
  const buttons = emptyButtons();
  for (const p of pressed) (buttons as Record<string, boolean>)[p] = true;
  return {
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
    l2: 0,
    r2: 0,
    buttons,
    gyro: { x: 0, y: 0, z: 0 },
    accel: { x: 0, y: 0, z: 0 },
    touch: [
      { active: false, id: 0, x: 0, y: 0 },
      { active: false, id: 0, x: 0, y: 0 },
    ],
    battery: { percent: 100, state: 'full' },
    seq: 0,
  };
};

describe('applyMappings', () => {
  it('default profile maps cross→A, options→START, dpad', () => {
    const p = defaultProfile('p', 'p');
    const o = applyMappings(
      raw(['cross', 'options', 'dpadLeft']),
      p,
      createMappingState(),
      0,
      emptyXInput(),
    );
    expect(o.xinput.buttons.A).toBe(true);
    expect(o.xinput.buttons.START).toBe(true);
    expect(o.xinput.buttons.DPAD_LEFT).toBe(true);
    expect(o.xinput.buttons.B).toBe(false);
  });
  it('multi-map presses all targets', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross = {
      targets: [
        { type: 'xbutton', button: 'A' },
        { type: 'xbutton', button: 'X' },
      ],
      turboHz: 0,
      continuous: false,
    };
    const o = applyMappings(raw(['cross']), p, createMappingState(), 0, emptyXInput());
    expect(o.xinput.buttons.A && o.xinput.buttons.X).toBe(true);
  });
  it('emits key down/up only on transitions', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.square = {
      targets: [{ type: 'key', code: 'VK_SPACE' }],
      turboHz: 0,
      continuous: false,
    };
    const s = createMappingState();
    expect(applyMappings(raw(['square']), p, s, 0, emptyXInput()).keys).toEqual([
      { code: 'VK_SPACE', down: true },
    ]);
    expect(applyMappings(raw(['square']), p, s, 1, emptyXInput()).keys).toEqual([]);
    expect(applyMappings(raw([]), p, s, 2, emptyXInput()).keys).toEqual([
      { code: 'VK_SPACE', down: false },
    ]);
  });
  it('turbo toggles at the configured frequency', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross = {
      targets: [{ type: 'xbutton', button: 'A' }],
      turboHz: 10,
      continuous: false,
    }; // 100 ms period
    const s = createMappingState();
    expect(applyMappings(raw(['cross']), p, s, 0, emptyXInput()).xinput.buttons.A).toBe(true);
    expect(applyMappings(raw(['cross']), p, s, 60, emptyXInput()).xinput.buttons.A).toBe(false);
    expect(applyMappings(raw(['cross']), p, s, 110, emptyXInput()).xinput.buttons.A).toBe(true);
  });
  it('mouse targets emit transitions', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.r1 = { targets: [{ type: 'mouse', button: 'left' }], turboHz: 0, continuous: false };
    const s = createMappingState();
    expect(applyMappings(raw(['r1']), p, s, 0, emptyXInput()).mouse).toEqual([
      { button: 'left', down: true },
    ]);
  });
  it('fills into a pre-filled xinput, keeping axes', () => {
    const p = defaultProfile('p', 'p');
    const x = emptyXInput();
    x.lx = 0.7;
    x.rt = 0.4;
    const o = applyMappings(raw(['cross']), p, createMappingState(), 0, x);
    expect(o.xinput).toBe(x);
    expect(o.xinput.lx).toBe(0.7);
    expect(o.xinput.buttons.A).toBe(true);
  });
  it('xtrigger target sets the trigger to full pull', () => {
    const p = defaultProfile('p', 'p');
    const o = applyMappings(raw(['l2', 'r2']), p, createMappingState(), 0, emptyXInput());
    expect(o.xinput.lt).toBe(1);
    expect(o.xinput.rt).toBe(1);
    expect(applyMappings(raw([]), p, createMappingState(), 0, emptyXInput()).xinput.lt).toBe(0);
  });
  it('macroStarts lists macro ids on the rising edge only', () => {
    const p = defaultProfile('p', 'p');
    p.macros = [
      {
        id: 'm1',
        name: 'm',
        steps: [{ target: { type: 'key', code: 'VK_A' }, holdMs: 10, delayMs: 0 }],
        loop: false,
      },
    ];
    p.mappings.triangle = {
      targets: [{ type: 'macro', macroId: 'm1' }],
      turboHz: 0,
      continuous: false,
    };
    const s = createMappingState();
    expect(applyMappings(raw(['triangle']), p, s, 0, emptyXInput()).macroStarts).toEqual(['m1']);
    expect(applyMappings(raw(['triangle']), p, s, 1, emptyXInput()).macroStarts).toEqual([]);
    expect(applyMappings(raw([]), p, s, 2, emptyXInput()).macroStarts).toEqual([]);
    expect(applyMappings(raw(['triangle']), p, s, 3, emptyXInput()).macroStarts).toEqual(['m1']);
  });
  it('returns a zero mouseMove', () => {
    const o = applyMappings(
      raw([]),
      defaultProfile('p', 'p'),
      createMappingState(),
      0,
      emptyXInput(),
    );
    expect(o.mouseMove).toEqual({ dx: 0, dy: 0 });
  });
});
