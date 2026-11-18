import { describe, expect, it } from 'vitest';
import {
  configFromEnv,
  parseEnvFile,
  resolveLicenseMode,
  safeCheckoutUrl,
} from '../../src/main/licensing/config.js';

const EMPTY = configFromEnv({});

describe('licensing config', () => {
  it('nothing configured is dormant', () => {
    expect(resolveLicenseMode(EMPTY, {})).toEqual({ kind: 'dormant' });
    expect(resolveLicenseMode(configFromEnv({ DUALFORGE_LS_STORE_ID: '1' }), {})).toEqual({
      kind: 'dormant',
    });
  });
  it('a store id and a product id enable Lemon Squeezy; PRODUCT_IDS is a list, PRODUCT_ID still counts', () => {
    const c = configFromEnv({
      DUALFORGE_LS_STORE_ID: '1',
      DUALFORGE_LS_PRODUCT_IDS: '2,3 , 2',
      DUALFORGE_LS_PRODUCT_ID: '4',
      DUALFORGE_LS_CHECKOUT_URL: 'https://x.lemonsqueezy.com/checkout',
    });
    expect(c.productIds).toEqual(['2', '3', '4']);
    const m = resolveLicenseMode(c, {});
    expect(m.kind).toBe('lemonsqueezy');
    expect(configFromEnv({ DUALFORGE_LS_PRODUCT_ID: '9' }).productIds).toEqual(['9']);
  });
  it('Polar runs only with an org id and all three benefit ids, and wins over Lemon Squeezy', () => {
    const polar = {
      DUALFORGE_POLAR_ORG_ID: 'org',
      DUALFORGE_POLAR_BENEFIT_MONTHLY: 'm',
      DUALFORGE_POLAR_BENEFIT_YEARLY: 'y',
    };
    expect(resolveLicenseMode(configFromEnv(polar), {})).toEqual({ kind: 'dormant' });
    const full = configFromEnv({
      ...polar,
      DUALFORGE_POLAR_BENEFIT_LIFETIME: 'l',
      DUALFORGE_POLAR_CHECKOUT_URL: 'https://buy.polar.sh/x',
      DUALFORGE_LS_STORE_ID: '1',
      DUALFORGE_LS_PRODUCT_ID: '2',
    });
    expect(resolveLicenseMode(full, {})).toMatchObject({
      kind: 'polar',
      config: {
        checkoutUrl: 'https://buy.polar.sh/x',
        polar: { organizationId: 'org', benefits: { monthly: 'm', yearly: 'y', lifetime: 'l' } },
      },
    });
  });
  it('the fake provider needs both the provider flag and the test data dir', () => {
    expect(resolveLicenseMode(EMPTY, { DUALFORGE_LICENSE_PROVIDER: 'fake' }).kind).toBe('dormant');
    const m = resolveLicenseMode(EMPTY, {
      DUALFORGE_LICENSE_PROVIDER: 'fake',
      DUALFORGE_DATA_DIR: 'C:\\tmp\\df',
      DUALFORGE_LS_CHECKOUT_URL: 'https://example.com/buy',
      DUALFORGE_FOUNDER_PUBLIC_KEY: 'abc',
    });
    expect(m).toMatchObject({
      kind: 'fake',
      dataDir: 'C:\\tmp\\df',
      founderPublicKey: 'abc',
      config: { checkoutUrl: 'https://example.com/buy' },
    });
  });
  it('only https links are kept', () => {
    expect(safeCheckoutUrl('https://a.b/c')).toBe('https://a.b/c');
    expect(safeCheckoutUrl('http://a.b/c')).toBe('');
    expect(safeCheckoutUrl('javascript:alert(1)')).toBe('');
    expect(safeCheckoutUrl('')).toBe('');
  });
  it('parses .env.licensing lines', () => {
    expect(
      parseEnvFile(
        '# Lemon Squeezy\r\nDUALFORGE_LS_STORE_ID=123\nexport DUALFORGE_LS_PRODUCT_IDS="4,5"\n\nnot a line\nDUALFORGE_LS_CHECKOUT_URL = \'https://x/y\'\n',
      ),
    ).toEqual({
      DUALFORGE_LS_STORE_ID: '123',
      DUALFORGE_LS_PRODUCT_IDS: '4,5',
      DUALFORGE_LS_CHECKOUT_URL: 'https://x/y',
    });
  });
});
