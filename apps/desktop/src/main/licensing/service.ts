import os from 'node:os';
import {
  emptyLicenseState,
  fillCopy,
  LICENSE_COPY,
  LICENSE_VARIANTS,
  type Entitlements,
  type LicenseState,
  type LicenseVariant,
  type LicenseView,
} from '@dualforge/shared';
import { FOUNDER_PREFIX, type FounderVerifier } from './founder.js';
import type { LicenseProvider, ProviderAnswer } from './provider.js';

export const OFFLINE_GRACE_DAYS = 14;
const DAY_MS = 86_400_000;
/** The daily check: the service wakes hourly and validates once the last good check is 24 h old. */
export const CHECK_EVERY_MS = DAY_MS;
export const WAKE_EVERY_MS = 3_600_000;
/** A lastCheck further in the future than this (clock skew aside) is a hand edit and counts as no check. */
const FUTURE_SLACK_MS = 5 * 60_000;
const MIN_KEY = 8;
const MAX_KEY = 200;

export interface LicenseServiceDeps {
  /** null in a dormant build: nothing is ever called. */
  provider: LicenseProvider | null;
  settingsStore: { getLicense(): LicenseState; setLicense(l: LicenseState): void };
  founderVerifier: FounderVerifier;
  clock?: { now(): number };
  log: { info(o: object): void; warn(o: object): void };
  enforced: boolean;
  checkoutUrl?: string;
  portalUrl?: string;
  hostname?: () => string;
  /** Every change (renderer `license:changed`); `tierChanged` when the engine must get re-gated profiles. */
  onChange?: (view: LicenseView, tierChanged: boolean) => void;
  timers?: {
    setInterval(fn: () => void, ms: number): unknown;
    clearInterval(h: unknown): void;
  };
}

interface Derived {
  tier: 'free' | 'pro';
  source: LicenseView['source'];
  founderName: string;
  /** A founder or review key's end date, '' for never. */
  founderEnds: string;
  /** Days since the last good check, when Pro was dropped for being offline past the grace. */
  pastGraceDays: number | null;
}

const variantOf = (v: string | undefined): LicenseVariant =>
  (LICENSE_VARIANTS as readonly string[]).includes(v ?? '') ? (v as LicenseVariant) : '';

/**
 * The one place that decides Free or Pro (main process). State is the settings.json `license` block, which only this
 * service writes; the tier is re-derived from it on every start and wake, so a hand edit grants nothing beyond what the
 * cached provider answer (or a valid founder key) says.
 */
export function createLicenseService(d: LicenseServiceDeps) {
  const now = () => (d.clock ?? Date).now();
  const host = d.hostname ?? (() => os.hostname());
  const iso = () => new Date(now()).toISOString();
  let message = ''; // the last operation's message (bad key, limit, offline); derived messages need no memory
  let lastCheckWarnDay = -1;
  let chain: Promise<unknown> = Promise.resolve();
  let timer: unknown = null;

  function derive(s: LicenseState): Derived {
    const none: Derived = {
      tier: 'free',
      source: 'none',
      founderName: '',
      founderEnds: '',
      pastGraceDays: null,
    };
    if (!d.enforced) return none;
    if (s.founderKey) {
      const r = d.founderVerifier.verify(s.founderKey, now());
      if (r.ok)
        return {
          ...none,
          tier: 'pro',
          source: 'founder',
          founderName: r.payload.name,
          founderEnds: r.payload.expiresAt ?? '',
        };
    }
    if (!s.key) return none;
    const keyed: Derived = { ...none, source: 'key' };
    if (s.status !== 'active') return keyed;
    const at = Date.parse(s.lastCheck);
    if (!Number.isFinite(at) || at > now() + FUTURE_SLACK_MS) return keyed;
    const age = Math.max(0, now() - at);
    if (age <= OFFLINE_GRACE_DAYS * DAY_MS) return { ...keyed, tier: 'pro' };
    return { ...keyed, pastGraceDays: Math.floor(age / DAY_MS) };
  }

  let current: Entitlements = {
    tier: derive(d.settingsStore.getLicense()).tier,
    enforced: d.enforced,
  };

  function view(): LicenseView {
    const s = d.settingsStore.getLicense();
    const r = derive(s);
    let msg = message;
    if (!msg && r.tier === 'free' && d.enforced) {
      if (r.pastGraceDays !== null)
        msg = fillCopy(LICENSE_COPY.offlinePast, { n: r.pastGraceDays });
      else if (s.key && s.status === 'expired') msg = LICENSE_COPY.lapsedExpired;
      else if (s.key && s.status === 'disabled') msg = LICENSE_COPY.lapsedDisabled;
      else if (s.key && s.status === 'invalid') msg = LICENSE_COPY.badKey;
    }
    return {
      enforced: d.enforced,
      tier: r.tier,
      source: r.source,
      status: s.status,
      variant: r.source === 'founder' ? 'founder-lifetime' : s.variant,
      expiresAt: r.source === 'founder' ? r.founderEnds : s.expiresAt,
      lastCheck: s.lastCheck,
      keyHint: s.key ? s.key.slice(-4) : '',
      message: msg,
      prices: LICENSE_COPY.pricesLine,
      checkoutUrl: !!d.checkoutUrl,
      portalUrl: !!d.portalUrl,
      founderName: r.founderName,
      hasLicense: !!(s.key || s.founderKey),
    };
  }

  /** Re-derives the tier; tells the app what changed. */
  function refresh(): LicenseView {
    const v = view();
    const next: Entitlements = { tier: v.tier, enforced: d.enforced };
    const changed = next.tier !== current.tier;
    current = next;
    d.onChange?.(v, changed);
    return v;
  }

  const save = (s: LicenseState) => d.settingsStore.setLicense(s);
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => undefined);
    return p;
  };

  function warnUnreachable() {
    const day = Math.floor(now() / DAY_MS);
    if (day === lastCheckWarnDay) return;
    lastCheckWarnDay = day;
    d.log.warn({ code: 'E_LICENSE_CHECK', msg: 'license server unreachable' });
  }

  /** Records a provider answer for the saved key (check, or re-activation of the same key). */
  function applyCheck(a: ProviderAnswer): void {
    const s = d.settingsStore.getLicense();
    if (!a.reached) {
      warnUnreachable();
      const r = derive(s);
      if (r.tier === 'pro' && r.source === 'key') {
        const left = OFFLINE_GRACE_DAYS - (now() - Date.parse(s.lastCheck)) / DAY_MS;
        message = fillCopy(LICENSE_COPY.offlineGrace, { n: Math.max(1, Math.ceil(left)) });
      } else message = '';
      return;
    }
    message = '';
    if (a.ok) {
      save({
        ...s,
        status: 'active',
        instanceId: a.instanceId ?? s.instanceId,
        variant: variantOf(a.variant) || s.variant,
        expiresAt: a.expiresAt ?? '',
        lastCheck: iso(),
      });
      return;
    }
    const status = a.status === 'expired' || a.status === 'disabled' ? a.status : 'invalid';
    if (s.status !== status)
      d.log.info({ code: 'LICENSE_LAPSED', status, keyHint: s.key.slice(-4) });
    save({ ...s, status });
  }

  async function activateStoreKey(key: string): Promise<void> {
    if (key.length < MIN_KEY || key.length > MAX_KEY) {
      message = LICENSE_COPY.badKey;
      return;
    }
    const s = d.settingsStore.getLicense();
    if (key === s.key && s.instanceId) {
      // the same key on the same PC: validate the instance we already hold instead of using up another activation
      applyCheck(await d.provider!.validate(key, s.instanceId));
      return;
    }
    const a = await d.provider!.activate(key, host());
    if (!a.reached) {
      warnUnreachable();
      message = LICENSE_COPY.offlineActivate;
      return;
    }
    if (!a.ok) {
      message =
        a.error === 'limit'
          ? LICENSE_COPY.limit
          : a.status === 'expired'
            ? LICENSE_COPY.lapsedExpired
            : a.status === 'disabled'
              ? LICENSE_COPY.lapsedDisabled
              : LICENSE_COPY.badKey;
      return; // a refused new key never replaces the saved state
    }
    message = '';
    save({
      ...s,
      key,
      instanceId: a.instanceId ?? '',
      status: 'active',
      variant: variantOf(a.variant),
      expiresAt: a.expiresAt ?? '',
      lastCheck: iso(),
    });
    d.log.info({
      code: 'LICENSE_ACTIVATED',
      source: 'key',
      variant: variantOf(a.variant),
      keyHint: key.slice(-4),
    });
  }

  function activateFounder(text: string): void {
    const r = d.founderVerifier.verify(text, now());
    if (!r.ok) {
      message = LICENSE_COPY.badKey;
      d.log.info({ code: 'LICENSE_FOUNDER_REFUSED', reason: r.error });
      return;
    }
    message = '';
    save({ ...d.settingsStore.getLicense(), founderKey: text });
    d.log.info({
      code: 'LICENSE_ACTIVATED',
      source: 'founder',
      kind: r.payload.kind,
      id: r.payload.id,
    });
  }

  async function check(): Promise<void> {
    const s = d.settingsStore.getLicense();
    if (!s.key) return;
    if (!s.instanceId) {
      await activateStoreKey(s.key);
      return;
    }
    applyCheck(await d.provider!.validate(s.key, s.instanceId));
  }

  const active = () => d.enforced && d.provider !== null;

  return {
    view,
    entitlements: (): Entitlements => current,
    activate: (text: unknown): Promise<LicenseView> =>
      serial(async () => {
        if (!active() || typeof text !== 'string') return view();
        const t = text.trim();
        if (t.startsWith(FOUNDER_PREFIX)) activateFounder(t);
        else await activateStoreKey(t);
        return refresh();
      }),
    check: (): Promise<LicenseView> =>
      serial(async () => {
        if (!active()) return view();
        await check();
        return refresh();
      }),
    remove: (): Promise<LicenseView> =>
      serial(async () => {
        if (!active()) return view();
        const s = d.settingsStore.getLicense();
        if (s.key && s.instanceId) {
          try {
            await d.provider!.deactivate(s.key, s.instanceId); // best effort: the PC is Free either way
          } catch {
            /* unreachable */
          }
        }
        message = '';
        save(emptyLicenseState());
        if (s.key || s.founderKey)
          d.log.info({ code: 'LICENSE_REMOVED', keyHint: s.key ? s.key.slice(-4) : '' });
        return refresh();
      }),
    /** Validates when the last good check is 24 h old (or never happened); always re-derives the tier. */
    maybeCheck: (): Promise<LicenseView> =>
      serial(async () => {
        if (!active()) return view();
        const s = d.settingsStore.getLicense();
        const at = Date.parse(s.lastCheck);
        if (s.key && (!Number.isFinite(at) || now() - at >= CHECK_EVERY_MS || at > now()))
          await check();
        return refresh();
      }),
    start(): void {
      if (!active() || timer !== null) return;
      const t = d.timers ?? { setInterval, clearInterval };
      void this.maybeCheck();
      timer = t.setInterval(() => void this.maybeCheck(), WAKE_EVERY_MS);
    },
    stop(): void {
      if (timer === null) return;
      (d.timers ?? { setInterval, clearInterval }).clearInterval(timer as never);
      timer = null;
    },
  };
}
export type LicenseService = ReturnType<typeof createLicenseService>;
