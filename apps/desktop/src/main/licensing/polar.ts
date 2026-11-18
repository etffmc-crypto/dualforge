import { UNREACHABLE, type LicenseProvider, type ProviderAnswer } from './provider.js';

export const POLAR_BASE_URL = 'https://api.polar.sh';
export const POLAR_TIMEOUT_MS = 10_000;

/** What the build knows about the Polar store (filled in once Ethan's Polar organization and products exist). */
export interface PolarConfig {
  organizationId: string;
  /** Polar license-key benefit id per tier; a key whose benefit is in none of them is `wrong-product`. */
  benefits: { monthly: string; yearly: string; lifetime: string };
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** The parts of a customer-portal license-keys answer we read (polar.sh/docs/api-reference/customer-portal/license-keys). */
interface PolarKey {
  organization_id?: string;
  benefit_id?: string;
  status?: string;
  expires_at?: string | null;
}
interface PolarBody {
  // activate: the activation, with the key nested
  id?: string;
  label?: string;
  license_key?: PolarKey | null;
  // validate: the key itself
  organization_id?: string;
  benefit_id?: string;
  status?: string;
  expires_at?: string | null;
  activation?: { id?: string; label?: string } | null;
  // errors
  error?: string;
  detail?: unknown;
}

/**
 * Polar customer-portal license-key client. These endpoints need no access token (they are built for desktop apps):
 * JSON POSTs to a fixed base URL with a 10 s timeout. Polar answers 404 for an unknown, revoked, disabled or expired key
 * and for a validate whose activation does not match, so those all read as `bad-key`; 403 on activate is a key that
 * cannot be activated (activation limit reached, or revoked/disabled/expired).
 */
export class PolarProvider implements LicenseProvider {
  readonly name = 'polar';
  constructor(
    private readonly config: PolarConfig,
    private readonly fetchFn: FetchLike = fetch,
    private readonly timeoutMs = POLAR_TIMEOUT_MS,
  ) {}

  private async post(
    path: string,
    json: Record<string, string>,
  ): Promise<{ status: number; body: PolarBody } | null> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(`${POLAR_BASE_URL}/v1/customer-portal/license-keys/${path}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...json, organization_id: this.config.organizationId }),
        signal: ctl.signal,
      });
      // rate limits and server errors say nothing about the key: keep the cached state (offline grace)
      if (res.status >= 500 || res.status === 429) return null;
      if (res.status === 204) return { status: 204, body: {} };
      let body: PolarBody;
      try {
        body = ((await res.json()) as PolarBody) ?? {};
      } catch {
        return null; // not Polar talking (a proxy, firewall or captive portal page)
      }
      // an error status is Polar's answer only in its own shapes: 404 ResourceNotFound, 403 NotPermitted, 422 detail[]
      if (!res.ok) {
        const known =
          (res.status === 404 && body.error === 'ResourceNotFound') ||
          (res.status === 403 && body.error === 'NotPermitted') ||
          (res.status === 422 && Array.isArray(body.detail));
        if (!known) return null;
      }
      return { status: res.status, body };
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  private variantOf(benefitId: string): ProviderAnswer['variant'] | undefined {
    const b = this.config.benefits;
    if (benefitId && benefitId === b.lifetime) return 'lifetime';
    if (benefitId && benefitId === b.yearly) return 'yearly';
    if (benefitId && benefitId === b.monthly) return 'monthly';
    return undefined;
  }

  private answer(
    r: { status: number; body: PolarBody },
    instanceId: string | undefined,
  ): ProviderAnswer {
    const b = r.body;
    if (r.status === 403) {
      const detail = typeof b.detail === 'string' ? b.detail.toLowerCase() : '';
      if (/limit/.test(detail))
        return { reached: true, ok: false, status: 'active', error: 'limit' };
      if (/expired/.test(detail))
        return { reached: true, ok: false, status: 'expired', error: 'expired' };
      if (/revoked|disabled/.test(detail))
        return { reached: true, ok: false, status: 'disabled', error: 'disabled' };
      return { reached: true, ok: false, status: 'active', error: 'limit' };
    }
    if (r.status >= 300) return { reached: true, ok: false, status: 'invalid', error: 'bad-key' };
    // activate nests the key; validate is the key
    const key: PolarKey = b.license_key ?? b;
    const variant = this.variantOf(key.benefit_id ?? '');
    if (key.organization_id !== this.config.organizationId || variant === undefined)
      return { reached: true, ok: false, status: 'invalid', error: 'wrong-product' };
    const id = instanceId ?? b.activation?.id ?? b.id;
    const label = b.activation?.label ?? b.label;
    return {
      reached: true,
      ok: true,
      status: 'active',
      ...(id ? { instanceId: String(id) } : {}),
      ...(typeof label === 'string' ? { instanceName: label } : {}),
      expiresAt: key.expires_at ?? null,
      variant,
    };
  }

  async activate(key: string, instanceName: string): Promise<ProviderAnswer> {
    const r = await this.post('activate', { key, label: instanceName });
    if (!r) return UNREACHABLE;
    return this.answer(r, undefined);
  }

  async validate(key: string, instanceId: string): Promise<ProviderAnswer> {
    const r = await this.post('validate', { key, activation_id: instanceId });
    if (!r) return UNREACHABLE;
    return this.answer(r, instanceId);
  }

  async deactivate(key: string, instanceId: string): Promise<{ reached: boolean }> {
    const r = await this.post('deactivate', { key, activation_id: instanceId });
    return { reached: r !== null };
  }
}
