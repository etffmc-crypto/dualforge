import { describe, expect, it } from 'vitest';
import { ProfileSchema, defaultProfile, DS_BUTTONS, ensureDenseMappings } from '../src/index.js';

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
    p.sticks.left.curve = {
      kind: 'custom',
      points: [
        [0.2, 0.1],
        [0.1, 0.2],
        [0.3, 0.3],
        [0.4, 0.4],
        [0.5, 0.5],
        [0.6, 0.6],
        [0.8, 0.8],
        [1, 1],
      ],
    };
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });
  it('accepts each trigger effect mode', () => {
    const p = defaultProfile('p', 'p');
    for (const e of [
      { mode: 'resistance', start: 2, force: 6 },
      { mode: 'section', start: 2, end: 6, force: 8 },
      { mode: 'vibration', frequency: 20, force: 5 },
    ] as const) {
      p.triggers.left.effect = e;
      expect(ProfileSchema.safeParse(p).success).toBe(true);
    }
  });
  it('rejects non-monotone advanced filter curve x', () => {
    const p = defaultProfile('p', 'p');
    p.sticks.left.filter.curve = [
      [0, 0],
      [0.5, 0],
      [0.2, 0],
      [0.7, 0],
      [1, 0],
    ];
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });
});

describe('plan 3A schema additions', () => {
  it('old profile without gyro/macros/digital/lights ext parses with defaults', () => {
    const p = defaultProfile('p', 'p') as unknown as {
      gyro?: unknown;
      macros?: unknown;
      triggers: { left: { digital?: boolean } };
      lights: Record<string, unknown>;
    };
    delete p.gyro;
    delete p.macros;
    delete p.triggers.left.digital;
    delete p.lights.mode;
    delete p.lights.speed;
    delete p.lights.micLed;
    const r = ProfileSchema.safeParse(p);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.gyro.output).toBe('off');
      expect(r.data.macros).toEqual([]);
      expect(r.data.triggers.left.digital).toBe(true);
      expect(r.data.lights.mode).toBe('static');
    }
  });
  it('rejects a macro target referencing a missing macro id', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross = {
      targets: [{ type: 'macro', macroId: 'nope' }],
      turboHz: 0,
      continuous: false,
    };
    expect(ProfileSchema.safeParse(p).success).toBe(false);
    p.macros = [
      {
        id: 'nope',
        name: 'm',
        steps: [{ target: { type: 'key', code: 'VK_A' }, holdMs: 10, delayMs: 0 }],
        loop: false,
      },
    ];
    expect(ProfileSchema.safeParse(p).success).toBe(true);
  });
  it('default l2/r2 map to xtrigger', () => {
    const p = defaultProfile('p', 'p');
    expect(p.mappings.l2?.targets[0]).toEqual({ type: 'xtrigger', trigger: 'lt' });
    expect(p.mappings.r2?.targets[0]).toEqual({ type: 'xtrigger', trigger: 'rt' });
  });
});

describe('final-review schema hardening', () => {
  const macro = (id: string, target: object = { type: 'key', code: 'VK_A' }) => ({
    id,
    name: id,
    steps: [{ target, holdMs: 10, delayMs: 0 }],
    loop: false,
  });
  it('rejects key codes not in the VK table (e.g. prototype names)', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross = {
      targets: [{ type: 'key', code: 'constructor' }],
      turboHz: 0,
      continuous: false,
    };
    expect(ProfileSchema.safeParse(p).success).toBe(false);
    p.mappings.cross = {
      targets: [{ type: 'key', code: 'VK_SPACE' }],
      turboHz: 0,
      continuous: false,
    };
    expect(ProfileSchema.safeParse(p).success).toBe(true);
  });
  it('rejects duplicate macro ids', () => {
    const p = defaultProfile('p', 'p');
    p.macros = [macro('a') as never, macro('a') as never];
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });
  it('rejects a macro step that targets a macro', () => {
    const p = defaultProfile('p', 'p');
    p.macros = [macro('a', { type: 'macro', macroId: 'a' }) as never];
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });
  it('requires activateButton for hold/toggle gyro activation', () => {
    const p = defaultProfile('p', 'p');
    p.gyro = { ...p.gyro, activate: 'hold', activateButton: null };
    expect(ProfileSchema.safeParse(p).success).toBe(false);
    p.gyro = { ...p.gyro, activate: 'toggle', activateButton: null };
    expect(ProfileSchema.safeParse(p).success).toBe(false);
    p.gyro = { ...p.gyro, activate: 'hold', activateButton: 'l1' };
    expect(ProfileSchema.safeParse(p).success).toBe(true);
    p.gyro = { ...p.gyro, activate: 'always', activateButton: null };
    expect(ProfileSchema.safeParse(p).success).toBe(true);
  });
});

describe('ensureDenseMappings', () => {
  it('fills every missing button with its default mapping and keeps the ones present', () => {
    const p = defaultProfile('p1', 'Profile 1');
    const custom = { targets: [{ type: 'none' as const }], turboHz: 10, continuous: true };
    const sparse = { ...p, mappings: { cross: custom } as typeof p.mappings };
    const dense = ensureDenseMappings(sparse);
    for (const b of DS_BUTTONS) expect(dense.mappings[b]).toBeDefined();
    expect(dense.mappings.cross).toEqual(custom);
    expect(dense.mappings.circle).toEqual(defaultProfile('x', 'x').mappings.circle);
    expect(Object.keys(sparse.mappings)).toEqual(['cross']); // pure: the input is untouched
  });
  it('returns the same object when nothing is missing', () => {
    const p = defaultProfile('p1', 'Profile 1');
    expect(ensureDenseMappings(p)).toBe(p);
  });
});
