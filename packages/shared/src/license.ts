import { z } from 'zod';
import type { Mapping, Profile, Target } from './profile.js';
import type { Settings } from './settings.js';

/**
 * DualForge Pro (spec docs/superpowers/specs/2026-10-16-pro-licensing.md). Pure helpers shared by main (which enforces)
 * and the renderer (which only shows the gates). Copy is DF-023 (company/departments/revenue/price-page-copy.md).
 */
export type Tier = 'free' | 'pro';
export interface Entitlements {
  tier: Tier;
  /** False until a provider is configured: a dormant build behaves exactly like 0.3.x. */
  enforced: boolean;
}
export const DORMANT: Entitlements = { tier: 'free', enforced: false };

/** Pro for gating: a dormant build gates nothing. */
export const isPro = (e: Entitlements): boolean => !e.enforced || e.tier === 'pro';

export const PRO_FEATURES = {
  keyMouse: 'Keyboard and mouse mappings',
  macros: 'Macros',
  turbo: 'Turbo',
  triggerEffects: 'Adaptive trigger effects',
  gyroMouse: 'Gyro to the mouse',
  slots34: 'Profile slots 3 and 4',
  shareExport: 'Share-code export',
  autoSwitch: 'Per-game auto-switch',
} as const;
export type ProFeature = keyof typeof PRO_FEATURES;

export const FREE_SLOTS: readonly string[] = ['p1', 'p2'];
export const isFreeSlot = (id: string): boolean => FREE_SLOTS.includes(id);

const proTarget = (t: Target): boolean =>
  t.type === 'key' || t.type === 'mouse' || t.type === 'macro';

/**
 * The profile the engine runs: when not Pro, keyboard, mouse and macro targets become `none`, turbo is off, trigger
 * effects are off and gyro-to-mouse is off (macros are dropped from the engine copy, so a play-test finds nothing to run).
 * The input is never mutated; the saved profile keeps everything.
 */
export function applyEntitlements(profile: Profile, e: Entitlements): Profile {
  if (isPro(e)) return profile;
  const mappings = Object.fromEntries(
    Object.entries(profile.mappings).map(([b, m]) => {
      const kept = m.targets.filter((t) => !proTarget(t)).map((t) => ({ ...t }));
      const next: Mapping = {
        ...m,
        targets: kept.length > 0 ? kept : [{ type: 'none' }],
        turbo: { ...m.turbo, mode: 'off' },
      };
      return [b, next];
    }),
  ) as Profile['mappings'];
  return {
    ...profile,
    mappings,
    triggers: {
      left: { ...profile.triggers.left, effect: { mode: 'off' } },
      right: { ...profile.triggers.right, effect: { mode: 'off' } },
    },
    gyro: {
      ...profile.gyro,
      output: profile.gyro.output === 'mouse' ? 'off' : profile.gyro.output,
    },
    macros: [],
  };
}

/** The settings the engine gets: when not Pro the on-pad turbo combo is off (`turbo.modeButton` null). */
export function applySettingsEntitlements(settings: Settings, e: Entitlements): Settings {
  if (isPro(e) || settings.turbo.modeButton === null) return settings;
  return { ...settings, turbo: { ...settings.turbo, modeButton: null } };
}

/** Which Pro settings `profile` holds (for "kept, paused" notes). */
export function proSettingsIn(profile: Profile): ProFeature[] {
  const maps = Object.values(profile.mappings);
  const targets = maps.flatMap((m) => m.targets);
  const out: ProFeature[] = [];
  if (targets.some((t) => t.type === 'key' || t.type === 'mouse')) out.push('keyMouse');
  if (targets.some((t) => t.type === 'macro') || profile.macros.length > 0) out.push('macros');
  if (maps.some((m) => m.turbo.mode !== 'off')) out.push('turbo');
  if (profile.triggers.left.effect.mode !== 'off' || profile.triggers.right.effect.mode !== 'off')
    out.push('triggerEffects');
  if (profile.gyro.output === 'mouse') out.push('gyroMouse');
  return out;
}

export const LICENSE_STATUSES = ['', 'active', 'expired', 'disabled', 'invalid'] as const;
export const LICENSE_VARIANTS = ['', 'monthly', 'yearly', 'lifetime', 'founder-lifetime'] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];
export type LicenseVariant = (typeof LICENSE_VARIANTS)[number];

/** The `license` block of settings.json; written only by main's LicenseService. */
export const LicenseStateSchema = z.object({
  key: z.string().max(200).default(''),
  instanceId: z.string().max(200).default(''),
  status: z.enum(LICENSE_STATUSES).default(''),
  variant: z.enum(LICENSE_VARIANTS).default(''),
  expiresAt: z.string().max(64).default(''),
  lastCheck: z.string().max(64).default(''),
  founderKey: z.string().max(4096).default(''),
  /** The latest time this PC has seen (ISO): an expiring founder key is refused while the clock is behind it. */
  seenAt: z.string().max(64).default(''),
});
export type LicenseState = z.infer<typeof LicenseStateSchema>;
export const emptyLicenseState = (): LicenseState => LicenseStateSchema.parse({});

/** What the renderer sees (never the full key). */
export interface LicenseView {
  enforced: boolean;
  tier: Tier;
  source: 'none' | 'key' | 'founder';
  status: LicenseStatus;
  variant: LicenseVariant;
  expiresAt: string;
  lastCheck: string;
  /** Last 4 characters of the saved store key, '' when none. */
  keyHint: string;
  message: string;
  prices: string;
  /** True when a checkout link is baked in (main opens it; the renderer never gets to pick a URL). */
  checkoutUrl: boolean;
  /** True when the Lemon Squeezy billing portal link is baked in ("billing portal" becomes a link). */
  portalUrl: boolean;
  founderName: string;
  /** A store key or founder key is saved (Remove license applies). */
  hasLicense: boolean;
}

/** DF-023 copy, verbatim. `{date}` and `{n}` are filled by `fillCopy`. */
export const LICENSE_COPY = {
  title: 'Plan',
  badgeFree: 'Free',
  badgePro: 'Pro',
  badgeFounder: 'Pro (founder key)',
  freeLine:
    "You're on DualForge Free. Pro adds keyboard and mouse mappings, macros, turbo, adaptive trigger effects, gyro to the mouse, profile slots 3 and 4, share-code export and per-game auto-switch.",
  pricesLine: 'Pro: $4.99 a month, $29.99 a year, or $49.99 lifetime with all future updates.',
  getPro: 'Get Pro',
  keyLabel: 'License key',
  keyHint: 'Paste the key from your purchase receipt, or a founder key.',
  activate: 'Activate',
  proLine: 'Pro is active on this PC.',
  /** DF-023 "Pro (monthly) or Pro (yearly)…": `{plan}` is monthly or yearly. No renewal date (Lemon Squeezy does not promise one). */
  proSubscription: 'Pro ({plan}). Manage or cancel it in your Lemon Squeezy billing portal.',
  /** Not in DF-023: a founder or review key issued with an end date. */
  founderEnds: 'Ends on {date}.',
  proLifetime: 'Lifetime: all future updates included.',
  lastCheck: 'Last checked {date}.',
  check: 'Check now',
  remove: 'Remove license',
  removeHint: 'Removes the key from this PC so you can use it on another one. Your profiles stay.',
  lapsedExpired:
    'Your Pro subscription has ended, so this PC is back on Free. Your profiles and Pro settings are kept; they work again when Pro is back.',
  lapsedDisabled: 'This key was turned off, so this PC is back on Free. Your profiles are kept.',
  offlineGrace: "Couldn't reach the license server. Pro stays on for {n} more days.",
  offlinePast:
    "Couldn't reach the license server for {n} days, so this PC is back on Free. Check now when you're online.",
  badKey: "That key wasn't accepted. Check that you pasted the whole key.",
  limit:
    'This key is already active on the most PCs it allows. Remove it on another PC first, then try again.',
  /** Not in DF-023 (activating while offline: nothing is saved yet, so not "Check now"). */
  offlineActivate: "Couldn't reach the license server. Try again when you're online.",
  gateTag: 'Pro',
  gateLine: '{feature} is part of DualForge Pro.',
  paused: "This profile has Pro settings. They're kept, and they work again when Pro is back.",
} as const;

export function fillCopy(
  text: string,
  vars: { date?: string; n?: number; feature?: string; plan?: string },
) {
  return text
    .replace('{plan}', vars.plan ?? '')
    .replace('{date}', vars.date ?? '')
    .replace('{n}', vars.n === undefined ? '' : String(vars.n))
    .replace('{feature}', vars.feature ?? '');
}
