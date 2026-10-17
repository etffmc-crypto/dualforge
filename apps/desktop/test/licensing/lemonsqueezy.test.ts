import { describe, expect, it, vi } from 'vitest';
import { configFromEnv } from '../../src/main/licensing/config.js';
import { LemonSqueezyProvider, mapVariant } from '../../src/main/licensing/lemonsqueezy.js';

const CONFIG = configFromEnv({
  DUALFORGE_LS_STORE_ID: '111',
  DUALFORGE_LS_PRODUCT_IDS: '222, 333',
});
const META = { store_id: 111, product_id: 222, variant_id: 9, variant_name: 'Monthly' };

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('Lemon Squeezy provider', () => {
  it('activates with a form-encoded POST to the fixed base URL', async () => {
    const fetch = reply(200, {
      activated: true,
      license_key: { status: 'active', expires_at: '2026-11-16T00:00:00Z' },
      instance: { id: 'inst-1' },
      meta: META,
    });
    const a = await new LemonSqueezyProvider(CONFIG, fetch).activate('KEY-1234', 'MY-PC');
    expect(a).toEqual({
      reached: true,
      ok: true,
      status: 'active',
      instanceId: 'inst-1',
      expiresAt: '2026-11-16T00:00:00Z',
      variant: 'monthly',
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.lemonsqueezy.com/v1/licenses/activate');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(String(init.body)).toBe('license_key=KEY-1234&instance_name=MY-PC');
  });
  it('accepts a key from any listed product (one-time lifetime in its own product)', async () => {
    const fetch = reply(200, {
      valid: true,
      license_key: { status: 'active', expires_at: null },
      instance: { id: 'i' },
      meta: { ...META, product_id: '333', variant_name: 'Lifetime' },
    });
    const a = await new LemonSqueezyProvider(CONFIG, fetch).validate('KEY-1234', 'i');
    expect(a).toMatchObject({ ok: true, expiresAt: null, variant: 'lifetime' });
    expect(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)).toBe(
      'license_key=KEY-1234&instance_id=i',
    );
  });
  it('refuses another store or a product not in the list as wrong-product', async () => {
    for (const meta of [
      { ...META, store_id: 999 },
      { ...META, product_id: 444 },
    ]) {
      const fetch = reply(200, { activated: true, license_key: { status: 'active' }, meta });
      expect(await new LemonSqueezyProvider(CONFIG, fetch).activate('KEY-1234', 'pc')).toEqual({
        reached: true,
        ok: false,
        status: 'invalid',
        error: 'wrong-product',
      });
    }
  });
  it('maps an unknown key to bad-key and the activation limit to limit', async () => {
    const p404 = new LemonSqueezyProvider(
      CONFIG,
      reply(404, { activated: false, error: 'license_key not found.' }),
    );
    expect(await p404.activate('KEY-0000', 'pc')).toMatchObject({ ok: false, error: 'bad-key' });
    const limit = new LemonSqueezyProvider(
      CONFIG,
      reply(400, {
        activated: false,
        error: 'This license key has reached the activation limit.',
        license_key: { status: 'active' },
        meta: META,
      }),
    );
    expect(await limit.activate('KEY-1234', 'pc')).toMatchObject({ ok: false, error: 'limit' });
  });
  it('reports expired and disabled keys', async () => {
    for (const status of ['expired', 'disabled']) {
      const p = new LemonSqueezyProvider(
        CONFIG,
        reply(200, { valid: false, license_key: { status }, meta: META }),
      );
      expect(await p.validate('KEY-1234', 'i')).toMatchObject({ reached: true, ok: false, status });
    }
  });
  it('network errors, 5xx and timeouts are not reached', async () => {
    const thrown = new LemonSqueezyProvider(
      CONFIG,
      vi.fn(async () => {
        throw new Error('ENOTFOUND');
      }),
    );
    expect(await thrown.validate('KEY-1234', 'i')).toMatchObject({
      reached: false,
      error: 'unreachable',
    });
    expect(
      await new LemonSqueezyProvider(CONFIG, reply(503, {})).validate('KEY-1234', 'i'),
    ).toMatchObject({ reached: false });
    const hang = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_res, rej) =>
          init.signal!.addEventListener('abort', () => rej(new Error('aborted'))),
        ),
    );
    expect(
      await new LemonSqueezyProvider(CONFIG, hang, 20).activate('KEY-1234', 'pc'),
    ).toMatchObject({ reached: false });
    expect(await new LemonSqueezyProvider(CONFIG, reply(503, {})).deactivate('k', 'i')).toEqual({
      reached: false,
    });
    expect(
      await new LemonSqueezyProvider(CONFIG, reply(200, { deactivated: true })).deactivate(
        'k',
        'i',
      ),
    ).toEqual({ reached: true });
  });
});

describe('variant mapping', () => {
  const none = configFromEnv({}).variants;
  it('matches the variant name, Founder before Lifetime, case-insensitive', () => {
    expect(mapVariant({ variant_name: 'Pro Monthly' }, none)).toBe('monthly');
    expect(mapVariant({ variant_name: 'YEARLY' }, none)).toBe('yearly');
    expect(mapVariant({ variant_name: 'Lifetime' }, none)).toBe('lifetime');
    expect(mapVariant({ variant_name: 'Founder lifetime' }, none)).toBe('founder-lifetime');
    expect(mapVariant({ variant_name: 'Default' }, none)).toBe('');
  });
  it('explicit variant ids win over the name', () => {
    const v = configFromEnv({ DUALFORGE_LS_VARIANT_FOUNDER: '77' }).variants;
    expect(mapVariant({ variant_id: 77, variant_name: 'Lifetime' }, v)).toBe('founder-lifetime');
    expect(mapVariant({ variant_id: 78, variant_name: 'Lifetime' }, v)).toBe('lifetime');
  });
});
