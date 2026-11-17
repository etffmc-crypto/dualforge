/**
 * Licensing build configuration. The store ids are baked in at build time (electron.vite.config.ts reads the
 * environment, else F:\DualForge\.env.licensing, into `__LICENSE_CONFIG__`). Polar (an organization id and at least
 * one Pro benefit id) wins over Lemon Squeezy (a store id and a product id); neither = dormant.
 */
export interface LicenseBuildConfig {
  storeId: string;
  /** Every Lemon Squeezy product whose keys are DualForge Pro (subscriptions and one-time lifetime may be separate). */
  productIds: string[];
  checkoutUrl: string;
  /** The store's customer billing portal (https://<store>.lemonsqueezy.com/billing); '' = plain text on the card. */
  portalUrl: string;
  /** Optional explicit variant ids; they win over the variant-name match. */
  variants: { monthly: string; yearly: string; lifetime: string };
  /** Polar (DF-030c): the organization, one license key benefit per Pro plan, and whether the build talks to the sandbox. */
  polar: {
    organizationId: string;
    benefits: { monthly: string; yearly: string; lifetime: string };
    sandbox: boolean;
  };
}

export type LicenseMode =
  | { kind: 'dormant' }
  | { kind: 'polar'; config: LicenseBuildConfig }
  | { kind: 'lemonsqueezy'; config: LicenseBuildConfig }
  | { kind: 'fake'; config: LicenseBuildConfig; dataDir: string; founderPublicKey?: string };

type Env = Record<string, string | undefined>;

const list = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const str = (v: string | undefined): string => (v ?? '').trim();

/**
 * Reads the DUALFORGE_POLAR_* and DUALFORGE_LS_* keys (DUALFORGE_LS_PRODUCT_IDS, comma-separated;
 * DUALFORGE_LS_PRODUCT_ID still counts). The checkout and portal links come from Polar's keys first.
 */
export function configFromEnv(env: Env): LicenseBuildConfig {
  const ids = [...list(env.DUALFORGE_LS_PRODUCT_IDS), ...list(env.DUALFORGE_LS_PRODUCT_ID)];
  return {
    storeId: str(env.DUALFORGE_LS_STORE_ID),
    productIds: [...new Set(ids)],
    checkoutUrl: str(env.DUALFORGE_POLAR_CHECKOUT_URL) || str(env.DUALFORGE_LS_CHECKOUT_URL),
    portalUrl: str(env.DUALFORGE_POLAR_PORTAL_URL) || str(env.DUALFORGE_LS_PORTAL_URL),
    variants: {
      monthly: (env.DUALFORGE_LS_VARIANT_MONTHLY ?? '').trim(),
      yearly: (env.DUALFORGE_LS_VARIANT_YEARLY ?? '').trim(),
      lifetime: (env.DUALFORGE_LS_VARIANT_LIFETIME ?? '').trim(),
    },
    polar: {
      organizationId: str(env.DUALFORGE_POLAR_ORG_ID),
      benefits: {
        monthly: str(env.DUALFORGE_POLAR_BENEFIT_MONTHLY),
        yearly: str(env.DUALFORGE_POLAR_BENEFIT_YEARLY),
        lifetime: str(env.DUALFORGE_POLAR_BENEFIT_LIFETIME),
      },
      sandbox: /^(1|true|yes)$/i.test(str(env.DUALFORGE_POLAR_SANDBOX)),
    },
  };
}

/** True when the build names a Polar organization and at least one Pro benefit. */
export const hasPolar = (c: LicenseBuildConfig): boolean =>
  !!c.polar?.organizationId &&
  !!(c.polar.benefits.monthly || c.polar.benefits.yearly || c.polar.benefits.lifetime);

/** Only https links are opened (Get Pro, billing portal). */
export const safeCheckoutUrl = (u: string): string => {
  try {
    return new URL(u).protocol === 'https:' ? u : '';
  } catch {
    return '';
  }
};

/**
 * Which provider runs. The fake provider is honoured only for unpackaged test runs (DUALFORGE_LICENSE_PROVIDER=fake AND
 * DUALFORGE_DATA_DIR, the existing e2e marker, and `allowFake`, which main sets to !app.isPackaged); then DUALFORGE_LS_CHECKOUT_URL and DUALFORGE_FOUNDER_PUBLIC_KEY may
 * come from the environment too. Otherwise the baked config decides.
 */
export function resolveLicenseMode(
  baked: LicenseBuildConfig,
  env: Env,
  /** False in a packaged (shipped) build: the fake provider and the test founder key are never honoured there. */
  allowFake = true,
): LicenseMode {
  if (allowFake && env.DUALFORGE_LICENSE_PROVIDER === 'fake' && env.DUALFORGE_DATA_DIR) {
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
  if (hasPolar(baked))
    return {
      kind: 'polar',
      config: {
        ...baked,
        checkoutUrl: safeCheckoutUrl(baked.checkoutUrl),
        portalUrl: safeCheckoutUrl(baked.portalUrl),
      },
    };
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
