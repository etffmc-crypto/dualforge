/**
 * Licensing build configuration. The Lemon Squeezy ids are baked in at build time (electron.vite.config.ts reads the
 * environment, else F:\DualForge\.env.licensing, into `__LICENSE_CONFIG__`). No store id or no product id = dormant.
 */
export interface LicenseBuildConfig {
  storeId: string;
  /** Every Lemon Squeezy product whose keys are DualForge Pro (subscriptions and one-time lifetime may be separate). */
  productIds: string[];
  checkoutUrl: string;
  /** The store's customer billing portal (https://<store>.lemonsqueezy.com/billing); '' = plain text on the card. */
  portalUrl: string;
  /** Optional explicit variant ids; they win over the variant-name match. */
  variants: { monthly: string; yearly: string; lifetime: string; founder: string };
}

export type LicenseMode =
  | { kind: 'dormant' }
  | { kind: 'lemonsqueezy'; config: LicenseBuildConfig }
  | { kind: 'fake'; config: LicenseBuildConfig; dataDir: string; founderPublicKey?: string };

type Env = Record<string, string | undefined>;

const list = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Reads the DUALFORGE_LS_* keys (DUALFORGE_LS_PRODUCT_IDS, comma-separated; DUALFORGE_LS_PRODUCT_ID still counts). */
export function configFromEnv(env: Env): LicenseBuildConfig {
  const ids = [...list(env.DUALFORGE_LS_PRODUCT_IDS), ...list(env.DUALFORGE_LS_PRODUCT_ID)];
  return {
    storeId: (env.DUALFORGE_LS_STORE_ID ?? '').trim(),
    productIds: [...new Set(ids)],
    checkoutUrl: (env.DUALFORGE_LS_CHECKOUT_URL ?? '').trim(),
    portalUrl: (env.DUALFORGE_LS_PORTAL_URL ?? '').trim(),
    variants: {
      monthly: (env.DUALFORGE_LS_VARIANT_MONTHLY ?? '').trim(),
      yearly: (env.DUALFORGE_LS_VARIANT_YEARLY ?? '').trim(),
      lifetime: (env.DUALFORGE_LS_VARIANT_LIFETIME ?? '').trim(),
      founder: (env.DUALFORGE_LS_VARIANT_FOUNDER ?? '').trim(),
    },
  };
}

/** Only https links are opened (Get Pro, billing portal). */
export const safeCheckoutUrl = (u: string): string => {
  try {
    return new URL(u).protocol === 'https:' ? u : '';
  } catch {
    return '';
  }
};

/**
 * Which provider runs. The fake provider is honoured only for test runs (DUALFORGE_LICENSE_PROVIDER=fake AND
 * DUALFORGE_DATA_DIR, the existing e2e marker); then DUALFORGE_LS_CHECKOUT_URL and DUALFORGE_FOUNDER_PUBLIC_KEY may
 * come from the environment too. Otherwise the baked config decides.
 */
export function resolveLicenseMode(baked: LicenseBuildConfig, env: Env): LicenseMode {
  if (env.DUALFORGE_LICENSE_PROVIDER === 'fake' && env.DUALFORGE_DATA_DIR) {
    const fromEnv = configFromEnv(env);
    return {
      kind: 'fake',
      dataDir: env.DUALFORGE_DATA_DIR,
      config: {
        ...baked,
        checkoutUrl: safeCheckoutUrl(fromEnv.checkoutUrl || baked.checkoutUrl),
        portalUrl: safeCheckoutUrl(fromEnv.portalUrl || baked.portalUrl),
      },
      ...(env.DUALFORGE_FOUNDER_PUBLIC_KEY
        ? { founderPublicKey: env.DUALFORGE_FOUNDER_PUBLIC_KEY }
        : {}),
    };
  }
  if (baked.storeId && baked.productIds.length > 0)
    return {
      kind: 'lemonsqueezy',
      config: {
        ...baked,
        checkoutUrl: safeCheckoutUrl(baked.checkoutUrl),
        portalUrl: safeCheckoutUrl(baked.portalUrl),
      },
    };
  return { kind: 'dormant' };
}

/** Parses KEY=VALUE lines (# comments, optional quotes); used by the build to read .env.licensing. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2').trim();
  }
  return out;
}
