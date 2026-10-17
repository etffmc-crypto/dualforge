/**
 * A license store behind one interface, so Lemon Squeezy can be swapped for Polar (DF-030c) by writing one class.
 * Implementations never throw: a network error, timeout or 5xx is `reached: false`.
 */
export interface LicenseProvider {
  readonly name: string; // 'lemonsqueezy' | 'fake' | later 'polar'
  activate(key: string, instanceName: string): Promise<ProviderAnswer>;
  validate(key: string, instanceId: string): Promise<ProviderAnswer>;
  deactivate(key: string, instanceId: string): Promise<{ reached: boolean }>;
}

export interface ProviderAnswer {
  /** False on network error, timeout or 5xx. */
  reached: boolean;
  /** The key is valid for this product and active. */
  ok: boolean;
  /** active | inactive | expired | disabled | invalid */
  status: string;
  instanceId?: string;
  /** The instance name the store holds (validate and activate); this PC's fingerprint tag must be in it. */
  instanceName?: string;
  /** null = lifetime. */
  expiresAt?: string | null;
  /** monthly | yearly | lifetime | founder-lifetime, or '' when the variant is not recognised. */
  variant?: string;
  error?: 'bad-key' | 'limit' | 'wrong-product' | 'unreachable' | string;
}

export const UNREACHABLE: ProviderAnswer = {
  reached: false,
  ok: false,
  status: '',
  error: 'unreachable',
};
