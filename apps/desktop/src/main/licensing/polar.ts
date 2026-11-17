import type { LicenseBuildConfig } from './config.js';
import { UNREACHABLE, type LicenseProvider, type ProviderAnswer } from './provider.js';

export const POLAR_BASE_URL = 'https://api.polar.sh';
export const POLAR_SANDBOX_BASE_URL = 'https://sandbox-api.polar.sh';
export const POLAR_TIMEOUT_MS = 10_000;
/** Polar's own error names; a body without one (a proxy, firewall or captive portal page) is not Polar talking. */
const POLAR_ERRORS = new Set(['ResourceNotFound', 'NotPermitted']);
/** A 403 on activate is the seat limit when its detail talks about activations; otherwise the key is no longer active. */
const LIMIT_DETAIL = /activation/i;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** The parts of Polar's customer-portal license key answers we read (polar.sh/docs, API 2026-10). */
interface PolarKey {
  status?: string;
  benefit_id?: string | null;
  expires_at?: string | null;
}
interface PolarBody {
  // validate: the key itself, with the activation it was checked against
  benefit_id?: string | null;
  status?: string;
  expires_at?: string | null;
  activation?: { id?: string; label?: string } | null;
  // activate: the activation, with the key nested
  id?: string;
  label?: string;
  license_key?: PolarKey | null;
  // errors
  error?: string;
  detail?: unknown;
}

/** The variant a Polar license key benefit stands for; '' when the benefit is not one of ours. */
export function variantOfBenefit(
  benefitId: string | null | undefined,
  b: LicenseBuildConfig['polar']['benefits'],
): ProviderAnswer['variant'] {
  const id = benefitId ?? '';
  if (!id) return '';
  if (b.lifetime && id === b.lifetime) return 'lifetime';
  if (b.yearly && id === b.yearly) return 'yearly';
  if (b.monthly && id === b.monthly) return 'monthly';
  return '';
}

/**
 * Polar License Key client (customer-portal endpoints: no API key, made for desktop apps). JSON POSTs to a fixed base
 * URL (sandbox when the build says so) with a 10 s timeout. Every call names our organization, so a key from another
 * seller is unknown to Polar; a key from one of our benefits that is not DualForge Pro is refused as `wrong-product`.
 *
 * Polar answers differ from Lemon Squeezy's in two ways the mapping handles:
 * - validate has no "expired" answer: a revoked, disabled or expired key, or an activation that is gone, is a 404.
 *   That maps to `invalid`, which makes the service activate afresh; activate then says which (403 = no longer
 *   active or the seat limit, 404 = unknown key).
 * - there is no product or variant on the answer, only the benefit; each Pro plan has its own benefit.
 */
export class PolarProvider implements LicenseProvider {
  readonly name = 'polar';
  private readonly base: string;
  constructor(
    private readonly config: LicenseBuildConfig,
    private readonly fetchFn: FetchLike = fetch,
    private readonly timeoutMs = POLAR_TIMEOUT_MS,
  ) {
    this.base = config.polar.sandbox ? POLAR_SANDBOX_BASE_URL : POLAR_BASE_URL;
  }

  private ours(benefitId: string | null | undefined): boolean {
    const b = this.config.polar.benefits;
    return !!benefitId && [b.monthly, b.yearly, b.lifetime].includes(benefitId);
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ status: number; body: PolarBody } | null> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(`${this.base}/v1/customer-portal/license-keys/${path}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: this.config.polar.organizationId, ...body }),
        signal: ctl.signal,
      });
      // rate limits and server errors say nothing about the key: keep the cached state (offline grace)
      if (res.status >= 500 || res.status === 429) return null;
      if (res.status === 204) return { status: 204, body: {} }; // deactivate
      let parsed: PolarBody;
      try {
        parsed = ((await res.json()) as PolarBody) ?? {};
      } catch {
        return null; // not Polar talking
      }
      // an error status is Polar's answer only with one of its error names, or a 422 validation `detail` list;
      // anything else (a proxy 403 {"error":"Forbidden"}, a gateway page) is someone else's answer: not reached.
      if (
        !res.ok &&
        !POLAR_ERRORS.has(String(parsed.error ?? '')) &&
        !(res.status === 422 && Array.isArray(parsed.detail))
      )
        return null;
      return { status: res.status, body: parsed };
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  private good(
    benefitId: string | null | undefined,
    instanceId: string,
    instanceName: string | undefined,
    expiresAt: string | null | undefined,
  ): ProviderAnswer {
    return {
      reached: true,
      ok: true,
      status: 'active',
      ...(instanceId ? { instanceId } : {}),
      ...(typeof instanceName === 'string' ? { instanceName } : {}),
      expiresAt: expiresAt ?? null,
      variant: variantOfBenefit(benefitId, this.config.polar.benefits) ?? '',
    };
  }

  async activate(key: string, instanceName: string): Promise<ProviderAnswer> {
    const r = await this.post('activate', { key, label: instanceName });
    if (!r) return UNREACHABLE;
    if (r.status === 403) {
      const detail = typeof r.body.detail === 'string' ? r.body.detail : '';
      return LIMIT_DETAIL.test(detail)
        ? { reached: true, ok: false, status: 'active', error: 'limit' }
        : { reached: true, ok: false, status: 'expired', error: 'expired' };
    }
    if (r.status >= 300 || !r.body.id)
      return { reached: true, ok: false, status: 'invalid', error: 'bad-key' };
    const activationId = r.body.id;
    let benefitId = r.body.license_key?.benefit_id;
    let expiresAt = r.body.license_key?.expires_at;
    if (!benefitId) {
      // the activate answer did not carry the benefit: ask validate, which always does
      const v = await this.post('validate', { key, activation_id: activationId });
      if (!v) return UNREACHABLE;
      if (v.status >= 300) return { reached: true, ok: false, status: 'invalid', error: 'bad-key' };
      benefitId = v.body.benefit_id;
      expiresAt = v.body.expires_at;
    }
    if (!this.ours(benefitId)) {
      // give the seat back so the buyer's activation is not used up by a key that is not DualForge Pro
      await this.post('deactivate', { key, activation_id: activationId });
      return { reached: true, ok: false, status: 'invalid', error: 'wrong-product' };
    }
    return this.good(benefitId, activationId, r.body.label ?? instanceName, expiresAt);
  }

  async validate(key: string, instanceId: string): Promise<ProviderAnswer> {
    const r = await this.post(
      'validate',
      instanceId ? { key, activation_id: instanceId } : { key },
    );
    if (!r) return UNREACHABLE;
    if (r.status >= 300 || r.body.status !== 'granted')
      return { reached: true, ok: false, status: 'invalid', error: 'bad-key' };
    if (!this.ours(r.body.benefit_id))
      return { reached: true, ok: false, status: 'invalid', error: 'wrong-product' };
    return this.good(
      r.body.benefit_id,
      r.body.activation?.id ?? instanceId,
      r.body.activation?.label,
      r.body.expires_at,
    );
  }

  async deactivate(key: string, instanceId: string): Promise<{ reached: boolean }> {
    const r = await this.post('deactivate', { key, activation_id: instanceId });
    return { reached: r !== null };
  }
}
