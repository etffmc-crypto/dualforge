import { describe, expect, it } from 'vitest';
import {
  applyEntitlements,
  applySettingsEntitlements,
  defaultProfile,
  defaultSettings,
  DORMANT,
  fillCopy,
  isFreeSlot,
  isPro,
  LICENSE_COPY,
  LicenseStateSchema,
  PRO_FEATURES,
  proSettingsIn,
  ProfileSchema,
  type Entitlements,
  type Profile,
} from '../src/index.js';

const FREE: Entitlements = { tier: 'free', enforced: true };
const PRO: Entitlements = { tier: 'pro', enforced: true };

/** A profile holding every Pro setting at once. */
function loaded(): Profile {
  const p = defaultProfile('p1', 'Loaded');
  p.macros = [
    {
      id: 'm1',
      name: 'Combo',
      loop: false,
      steps: [{ target: { type: 'key', code: 'VK_SPACE' }, holdMs: 10, delayMs: 0 }],
    },
  ];
  p.mappings.cross = {
    targets: [{ type: 'key', code: 'VK_SPACE' }],
    turbo: { mode: 'hold', hz: 12 },
    continuous: false,
  };
  p.mappings.circle = {
    targets: [
      { type: 'mouse', button: 'left' },
      { type: 'xbutton', button: 'B' },
    ],
    turbo: { mode: 'off', hz: 12 },
    continuous: false,
  };
  p.mappings.square = {
    targets: [{ type: 'macro', macroId: 'm1' }],
    turbo: { mode: 'off', hz: 12 },
    continuous: false,
  };
  p.mappings.triangle = {
    targets: [{ type: 'xbutton', button: 'Y' }],
    turbo: { mode: 'toggle', hz: 20 },
    continuous: true,
  };
  p.triggers.left.effect = { mode: 'resistance', start: 2, force: 6 };
  p.triggers.right.effect = { mode: 'vibration', frequency: 20, force: 5 };
  p.gyro = { ...p.gyro, output: 'mouse' };
  return ProfileSchema.parse(p);
}

describe('isPro', () => {
  it('a dormant build gates nothing', () => {
    expect(isPro(DORMANT)).toBe(true);
    expect(isPro({ tier: 'free', enforced: false })).toBe(true);
  });
  it('enforced: Free is not Pro, Pro is', () => {
    expect(isPro(FREE)).toBe(false);
    expect(isPro(PRO)).toBe(true);
  });
});

describe('applyEntitlements', () => {
  it('returns the profile untouched when Pro or dormant', () => {
    const p = loaded();
    expect(applyEntitlements(p, PRO)).toBe(p);
    expect(applyEntitlements(p, DORMANT)).toBe(p);
  });
  it('keyboard and mouse targets become none, controller targets stay', () => {
    const out = applyEntitlements(loaded(), FREE);
    expect(out.mappings.cross!.targets).toEqual([{ type: 'none' }]);
    expect(out.mappings.circle!.targets).toEqual([{ type: 'xbutton', button: 'B' }]);
  });
  it('macro targets become none and the engine copy holds no macros', () => {
    const out = applyEntitlements(loaded(), FREE);
    expect(out.mappings.square!.targets).toEqual([{ type: 'none' }]);
    expect(out.macros).toEqual([]);
  });
  it('every turbo is off, keeping its speed', () => {
    const out = applyEntitlements(loaded(), FREE);
    for (const m of Object.values(out.mappings)) expect(m.turbo.mode).toBe('off');
    expect(out.mappings.triangle!.turbo.hz).toBe(20);
    expect(out.mappings.triangle!.continuous).toBe(true);
  });
  it('trigger effects are off, trigger modes stay', () => {
    const p = loaded();
    p.triggers.left.hairTrigger = { mode: 'fixed' };
    const out = applyEntitlements(p, FREE);
    expect(out.triggers.left.effect).toEqual({ mode: 'off' });
    expect(out.triggers.right.effect).toEqual({ mode: 'off' });
    expect(out.triggers.left.hairTrigger).toEqual({ mode: 'fixed' });
  });
  it('gyro to the mouse is off; gyro to the right stick stays', () => {
    expect(applyEntitlements(loaded(), FREE).gyro.output).toBe('off');
    const p = loaded();
    p.gyro.output = 'rightStick';
    expect(applyEntitlements(p, FREE).gyro.output).toBe('rightStick');
  });
  it('never mutates the input, and the result is a valid profile', () => {
    const p = loaded();
    const before = structuredClone(p);
    const out = applyEntitlements(p, FREE);
    expect(p).toEqual(before);
    expect(ProfileSchema.safeParse(out).success).toBe(true);
    expect(proSettingsIn(out)).toEqual([]);
  });
});

describe('applySettingsEntitlements', () => {
  it('turns the on-pad turbo combo off when not Pro, without mutating', () => {
    const s = defaultSettings();
    expect(applySettingsEntitlements(s, FREE).turbo.modeButton).toBeNull();
    expect(s.turbo.modeButton).toBe('touchpad');
    expect(applySettingsEntitlements(s, PRO)).toBe(s);
    expect(applySettingsEntitlements(s, DORMANT)).toBe(s);
  });
});

describe('proSettingsIn', () => {
  it('lists what a profile holds', () => {
    expect(proSettingsIn(loaded())).toEqual([
      'keyMouse',
      'macros',
      'turbo',
      'triggerEffects',
      'gyroMouse',
    ]);
    expect(proSettingsIn(defaultProfile('p1', 'Plain'))).toEqual([]);
  });
});

describe('slots, features and copy', () => {
  it('slots 1 and 2 are free', () => {
    expect(['p1', 'p2', 'p3', 'p4'].map(isFreeSlot)).toEqual([true, true, false, false]);
  });
  it('has the eight DF-023 feature names', () => {
    expect(Object.values(PRO_FEATURES)).toHaveLength(8);
    expect(PRO_FEATURES.slots34).toBe('Profile slots 3 and 4');
  });
  it('fills placeholders', () => {
    expect(fillCopy(LICENSE_COPY.offlineGrace, { n: 3 })).toBe(
      "Couldn't reach the license server. Pro stays on for 3 more days.",
    );
    expect(fillCopy(LICENSE_COPY.gateLine, { feature: PRO_FEATURES.turbo })).toBe(
      'Turbo is part of DualForge Pro.',
    );
  });
  it('the license block defaults to empty and drops unknown fields', () => {
    const s = LicenseStateSchema.parse({ tier: 'pro' });
    expect(s).toEqual({
      key: '',
      instanceId: '',
      status: '',
      variant: '',
      expiresAt: '',
      lastCheck: '',
      founderKey: '',
      seenAt: '',
    });
  });
});
