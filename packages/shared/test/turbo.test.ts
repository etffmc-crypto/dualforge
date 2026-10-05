import { describe, expect, it } from 'vitest';
import {
  EngineEventSchema,
  EngineSnapshotSchema,
  MappingSchema,
  ProfileSchema,
  SettingsSchema,
  TURBO_PRESETS,
  TurboSchema,
  defaultProfile,
  defaultSettings,
  ensureDenseMappings,
} from '../src/index.js';

describe('turbo schema', () => {
  it('default mappings carry turbo off at 12 Hz and no turboHz', () => {
    const p = defaultProfile('p', 'p');
    expect(p.mappings.cross!.turbo).toEqual({ mode: 'off', hz: 12 });
    expect('turboHz' in p.mappings.cross!).toBe(false);
  });
  it('migrates a legacy turboHz > 0 to hold mode and strips turboHz', () => {
    const m = MappingSchema.parse({
      targets: [{ type: 'none' }],
      turboHz: 15,
      continuous: false,
    });
    expect(m).toEqual({
      targets: [{ type: 'none' }],
      turbo: { mode: 'hold', hz: 15 },
      continuous: false,
    });
  });
  it('migrates a legacy turboHz 0 to off', () => {
    const m = MappingSchema.parse({ targets: [{ type: 'none' }], turboHz: 0, continuous: true });
    expect(m.turbo).toEqual({ mode: 'off', hz: 12 });
    expect('turboHz' in m).toBe(false);
  });
  it('clamps a fractional legacy turboHz below 1 Hz up to 1 Hz', () => {
    const m = MappingSchema.parse({ targets: [{ type: 'none' }], turboHz: 0.5, continuous: false });
    expect(m.turbo).toEqual({ mode: 'hold', hz: 1 });
  });
  it('an explicit turbo object wins over a stray turboHz', () => {
    const m = MappingSchema.parse({
      targets: [{ type: 'none' }],
      turbo: { mode: 'toggle', hz: 20 },
      turboHz: 5,
      continuous: false,
    });
    expect(m.turbo).toEqual({ mode: 'toggle', hz: 20 });
    expect('turboHz' in m).toBe(false);
  });
  it('defaults a missing turbo field', () => {
    const m = MappingSchema.parse({ targets: [{ type: 'none' }], continuous: false });
    expect(m.turbo).toEqual({ mode: 'off', hz: 12 });
  });
  it('rejects hz outside 1..30 and unknown modes', () => {
    expect(TurboSchema.safeParse({ mode: 'hold', hz: 0 }).success).toBe(false);
    expect(TurboSchema.safeParse({ mode: 'hold', hz: 31 }).success).toBe(false);
    expect(TurboSchema.safeParse({ mode: 'burst', hz: 10 }).success).toBe(false);
    expect(TurboSchema.safeParse({ mode: 'toggle', hz: 30 }).success).toBe(true);
  });
  it('a whole legacy profile migrates through ProfileSchema', () => {
    const p = defaultProfile('p', 'p') as unknown as { mappings: Record<string, object> };
    for (const k of Object.keys(p.mappings))
      p.mappings[k] = {
        targets: [{ type: 'none' }],
        turboHz: k === 'r1' ? 10 : 0,
        continuous: false,
      };
    const parsed = ProfileSchema.parse(p);
    expect(parsed.mappings.r1!.turbo).toEqual({ mode: 'hold', hz: 10 });
    expect(parsed.mappings.cross!.turbo).toEqual({ mode: 'off', hz: 12 });
    expect(JSON.stringify(parsed)).not.toContain('turboHz');
  });
  it('ensureDenseMappings fills with turbo off', () => {
    const p = defaultProfile('p', 'p');
    const sparse = { ...p, mappings: {} as typeof p.mappings };
    expect(ensureDenseMappings(sparse).mappings.cross!.turbo).toEqual({ mode: 'off', hz: 12 });
  });
  it('speed presets', () => {
    expect(TURBO_PRESETS).toEqual({ slow: 8, medium: 12, fast: 20 });
  });
});

describe('turbo settings', () => {
  it('defaults: touchpad mode button, pulse on, on-pad assignment on', () => {
    expect(defaultSettings().turbo).toEqual({
      modeButton: 'touchpad',
      lightbarPulse: true,
      onPadAssign: true,
    });
  });
  it('accepts a null mode button and rejects unknown buttons', () => {
    const ok = (turbo: unknown) => SettingsSchema.safeParse({ schemaVersion: 1, turbo }).success;
    expect(ok({ modeButton: null, lightbarPulse: false, onPadAssign: false })).toBe(true);
    expect(ok({ modeButton: 'ps' })).toBe(true);
    expect(ok({ modeButton: 'nope' })).toBe(false);
  });
  it('fills partial turbo settings with defaults', () => {
    const s = SettingsSchema.parse({ schemaVersion: 1, turbo: { lightbarPulse: false } });
    expect(s.turbo).toEqual({ modeButton: 'touchpad', lightbarPulse: false, onPadAssign: true });
  });
});

describe('turbo ipc', () => {
  const snap = {
    t: 0,
    connected: true,
    vigemReady: true,
    reportHz: 0,
    pipelineP99Ms: 0,
    battery: { percent: 0, state: 'unknown' },
    raw: { lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, buttons: {}, gyro: { x: 0, y: 0, z: 0 } },
    out: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} },
  };
  it('snapshot turbo flags are optional (older engines) and carried when present', () => {
    expect(EngineSnapshotSchema.parse(snap).turboActive).toBeUndefined();
    const s = EngineSnapshotSchema.parse({ ...snap, turboActive: true, turboConfigured: true });
    expect(s.turboActive).toBe(true);
    expect(s.turboConfigured).toBe(true);
    expect(EngineSnapshotSchema.safeParse({ ...snap, turboActive: 'yes' }).success).toBe(false);
  });
  it('profileEdit event validates button and turbo', () => {
    const ok = (edits: unknown) =>
      EngineEventSchema.safeParse({ type: 'profileEdit', profileId: 'p1', edits }).success;
    expect(ok([{ button: 'cross', turbo: { mode: 'hold', hz: 8 } }])).toBe(true);
    expect(ok([{ button: 'nope', turbo: { mode: 'hold', hz: 8 } }])).toBe(false);
    expect(ok([{ button: 'cross', turbo: { mode: 'hold', hz: 99 } }])).toBe(false);
    expect(ok([])).toBe(false);
  });
});
