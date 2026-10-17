import type { LicenseBuildConfig } from './config.js';
import { UNREACHABLE, type LicenseProvider, type ProviderAnswer } from './provider.js';

export const LS_BASE_URL = 'https://api.lemonsqueezy.com';
export const LS_TIMEOUT_MS = 10_000;
/** Reasons the License API gives ("license_key not found.", "instance_id not found.", "…reached the activation limit.", "…is expired"). */
export const LS_ERROR = /license[_ ]key|instance[_ ]id|activation limit/i;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** The parts of a License API answer we read (docs.lemonsqueezy.com/api/license-api). */
interface LsBody {
  activated?: boolean;
  valid?: boolean;
  deactivated?: boolean;
  error?: string | null;
  license_key?: { status?: string; expires_at?: string | null } | null;
  instance?: { id?: string; name?: string } | null;
  meta?: {
    store_id?: number | string;
    product_id?: number | string;
    variant_id?: number | string;
    variant_name?: string;
  } | null;
}

/**
 * The variant from the explicit ids first (DUALFORGE_LS_VARIANT_*), else from the variant name
 * ("Founder" before "Lifetime", then "Yearly", "Monthly", case-insensitive); '' when neither matches.
 */
export function mapVariant(
  meta: LsBody['meta'],
  v: LicenseBuildConfig['variants'],
): ProviderAnswer['variant'] {
  const id = meta?.variant_id === undefined ? '' : String(meta.variant_id);
  if (id) {
    if (v.founder && id === v.founder) return 'founder-lifetime';
    if (v.lifetime && id === v.lifetime) return 'lifetime';
    if (v.yearly && id === v.yearly) return 'yearly';
    if (v.monthly && id === v.monthly) return 'monthly';
  }
  const name = (meta?.variant_name ?? '').toLowerCase();
  if (name.includes('founder')) return 'founder-lifetime';
  if (name.includes('lifetime')) return 'lifetime';
  if (name.includes('yearly')) return 'yearly';
  if (name.includes('monthly')) return 'monthly';
  return '';
}

/**
 * Lemon Squeezy License API client (no API key needed). Form-encoded POSTs to a fixed base URL with a 10 s timeout;
 * answers for another store or a product not in the list are refused as `wrong-product`.
 */
export class LemonSqueezyProvider implements LicenseProvider {
  readonly name = 'lemonsqueezy';
  constructor(
    private readonly config: LicenseBuildConfig,
    private readonly fetchFn: FetchLike = fetch,
    private readonly timeoutMs = LS_TIMEOUT_MS,
  ) {}

  private async post(
    path: string,
    form: Record<string, string>,
  ): Promise<{ status: number; body: LsBody } | null> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(`${LS_BASE_URL}/v1/licenses/${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(form).toString(),
        signal: ctl.signal,
      });
      // rate limits and server errors say nothing about the key: keep the cached state (offline grace)
      if (res.status >= 500 || res.status === 429) return null;
      let body: LsBody;
      try {
        body = ((await res.json()) as LsBody) ?? {};
      } catch {
        return null; // not the License API talking (a proxy, firewall or captive portal page)
      }
      // an error status is the License API's answer only when it carries a key or a known License API reason;
      // anything else (a proxy 403 {"error":"Forbidden"}, a gateway) is someone else's answer: not reached
      if (!res.ok && !body.license_key && !body.meta && !LS_ERROR.test(body.error ?? ''))
        return null;
      return { status: res.status, body };
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  private ours(meta: LsBody['meta']): boolean {
    if (!meta) return false;
    return (
      String(meta.store_id ?? '') === this.config.storeId &&
      this.config.productIds.includes(String(meta.product_id ?? ''))
    );
  }

  private answer(r: { status: number; body: LsBody }, passed: boolean): ProviderAnswer {
    const b = r.body;
    const keyStatus = b.license_key?.status ?? '';
    const err = (b.error ?? '').toLowerCase();
    if (b.meta && !this.ours(b.meta))
      return { reached: true, ok: false, status: 'invalid', error: 'wrong-product' };
    if (keyStatus === 'expired' || keyStatus === 'disabled' || /expired|disabled/.test(err)) {
      const status = keyStatus === 'expired' || /expired/.test(err) ? 'expired' : 'disabled';
      return { reached: true, ok: false, status, error: status };
    }
    if (!passed) {
      if (/activation limit/.test(err))
        return { reached: true, ok: false, status: keyStatus || 'active', error: 'limit' };
      return { reached: true, ok: false, status: 'invalid', error: 'bad-key' };
    }
    if (!b.meta) return { reached: true, ok: false, status: 'invalid', error: 'wrong-product' };
    return {
      reached: true,
      ok: true,
      status: 'active',
      ...(b.instance?.id ? { instanceId: String(b.instance.id) } : {}),
      ...(typeof b.instance?.name === 'string' ? { instanceName: b.instance.name } : {}),
      expiresAt: b.license_key?.expires_at ?? null,
      variant: mapVariant(b.meta, this.config.variants) ?? '',
    };
  }

  async activate(key: string, instanceName: string): Promise<ProviderAnswer> {
    const r = await this.post('activate', { license_key: key, instance_name: instanceName });
    if (!r) return UNREACHABLE;
    return this.answer(r, r.status < 300 && r.body.activated === true);
  }

  async validate(key: string, instanceId: string): Promise<ProviderAnswer> {
    const r = await this.post('validate', { license_key: key, instance_id: instanceId });
    if (!r) return UNREACHABLE;
    return this.answer(r, r.status < 300 && r.body.valid === true);
  }

  async deactivate(key: string, instanceId: string): Promise<{ reached: boolean }> {
    const r = await this.post('deactivate', { license_key: key, instance_id: instanceId });
    return { reached: r !== null };
  }
}
