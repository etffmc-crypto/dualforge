import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configFromEnv, resolveLicenseMode } from '../../src/main/licensing/config.js';
import { createFounderVerifier } from '../../src/main/licensing/founder.js';
import { PolarProvider, variantOfBenefit } from '../../src/main/licensing/polar.js';
import { createLicenseService } from '../../src/main/licensing/service.js';
import { createSettingsStore } from '../../src/main/settings-store.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const MONTHLY = 'b-monthly';
const YEARLY = 'b-yearly';
const LIFETIME = 'b-lifetime';
const CONFIG = configFromEnv({
  DUALFORGE_POLAR_ORG_ID: ORG,
  DUALFORGE_POLAR_BENEFIT_MONTHLY: MONTHLY,
  DUALFORGE_POLAR_BENEFIT_YEARLY: YEARLY,
  DUALFORGE_POLAR_BENEFIT_LIFETIME: LIFETIME,
});

type Call = [string, RequestInit];
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const reply = (status: number, body: unknown) => vi.fn(async () => json(status, body));
const sent = (f: ReturnType<typeof vi.fn>, i = 0) => {
  const [url, init] = f.mock.calls[i] as unknown as Call;
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
};

/** A scripted Polar: keys with a benefit, a seat limit and a granted flag; activations by id with their label. */
function fakePolar(keys: Record<string, { benefit: string; limit: number; granted: boolean }>) {
  const acts = new Map<string, { key: string; label: string }>();
  let n = 0;
  let down = false;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (down) return json(503, { error: 'down' });
    const path = url.replace(
      /^https:\/\/(sandbox-)?api\.polar\.sh\/v1\/customer-portal\/license-keys\//,
      '',
    );
    const b = JSON.parse(String(init.body)) as Record<string, string>;
    const k = keys[b.key ?? ''];
    if (b.organization_id !== ORG || !k)
      return json(404, { error: 'ResourceNotFound', detail: 'License key not found' });
    if (path === 'activate') {
      if (!k.granted)
        return json(403, { error: 'NotPermitted', detail: 'License key is no longer active.' });
      const used = [...acts.values()].filter((a) => a.key === b.key).length;
      if (used >= k.limit)
        return json(403, {
          error: 'NotPermitted',
          detail: `License key only supports ${k.limit} activations.`,
        });
      const id = `act-${++n}`;
      acts.set(id, { key: b.key!, label: b.label! });
      return json(200, {
        id,
        label: b.label,
        license_key: { status: 'granted', benefit_id: k.benefit, expires_at: null },
      });
    }
    if (path === 'validate') {
      if (!k.granted)
        return json(404, { error: 'ResourceNotFound', detail: 'License key not found' });
      const a = b.activation_id ? acts.get(b.activation_id) : undefined;
      if (b.activation_id && (!a || a.key !== b.key))
        return json(404, { error: 'ResourceNotFound', detail: 'Activation not found' });
      return json(200, {
        status: 'granted',
        benefit_id: k.benefit,
        expires_at: null,
        activation: a ? { id: b.activation_id, label: a.label } : null,
      });
    }
    if (path === 'deactivate') {
      const a = acts.get(b.activation_id ?? '');
      if (!a || a.key !== b.key)
        return json(404, { error: 'ResourceNotFound', detail: 'Activation not found' });
      acts.delete(b.activation_id!);
      return new Response(null, { status: 204 });
    }
    return json(404, { error: 'ResourceNotFound', detail: 'no route' });
  });
  return { fetch, acts, keys, setDown: (v: boolean) => (down = v) };
}

describe('Polar config', () => {
  it('an organization id and a benefit id enable Polar, and Polar wins over Lemon Squeezy', () => {
    expect(resolveLicenseMode(CONFIG, {}).kind).toBe('polar');
    const both = configFromEnv({
      DUALFORGE_POLAR_ORG_ID: ORG,
      DUALFORGE_POLAR_BENEFIT_YEARLY: YEARLY,
      DUALFORGE_LS_STORE_ID: '1',
      DUALFORGE_LS_PRODUCT_IDS: '2',
    });
    expect(resolveLicenseMode(both, {}).kind).toBe('polar');
    expect(resolveLicenseMode(configFromEnv({ DUALFORGE_POLAR_ORG_ID: ORG }), {}).kind).toBe(
      'dormant',
    );
    expect(
      resolveLicenseMode(configFromEnv({ DUALFORGE_POLAR_BENEFIT_MONTHLY: MONTHLY }), {}).kind,
    ).toBe('dormant');
  });
  it('reads the sandbox flag and prefers Polar links over Lemon Squeezy ones', () => {
    const c = configFromEnv({
      DUALFORGE_POLAR_SANDBOX: '1',
      DUALFORGE_POLAR_CHECKOUT_URL: 'https://buy.polar.sh/polar_cl_x',
      DUALFORGE_LS_CHECKOUT_URL: 'https://x.lemonsqueezy.com/buy',
      DUALFORGE_POLAR_PORTAL_URL: 'http://not-https.example',
    });
    expect(c.polar.sandbox).toBe(true);
    expect(c.checkoutUrl).toBe('https://buy.polar.sh/polar_cl_x');
    expect(configFromEnv({}).polar.sandbox).toBe(false);
    const m = resolveLicenseMode(
      {
        ...c,
        polar: {
          ...c.polar,
          organizationId: ORG,
          benefits: { ...c.polar.benefits, monthly: MONTHLY },
        },
      },
      {},
    );
    expect(m.kind === 'polar' && m.config.portalUrl).toBe(''); // only https links are opened
  });
  it('maps each benefit to its plan', () => {
    expect(variantOfBenefit(MONTHLY, CONFIG.polar.benefits)).toBe('monthly');
    expect(variantOfBenefit(YEARLY, CONFIG.polar.benefits)).toBe('yearly');
    expect(variantOfBenefit(LIFETIME, CONFIG.polar.benefits)).toBe('lifetime');
    expect(variantOfBenefit('other', CONFIG.polar.benefits)).toBe('');
    expect(variantOfBenefit(null, CONFIG.polar.benefits)).toBe('');
  });
});

describe('Polar provider', () => {
  it('activates with a JSON POST naming our organization, at the fixed production URL', async () => {
    const fetch = reply(200, {
      id: 'act-1',
      label: 'MY-PC [df:abc]',
      license_key: { status: 'granted', benefit_id: MONTHLY, expires_at: null },
    });
    const a = await new PolarProvider(CONFIG, fetch).activate('POLAR-KEY-1234', 'MY-PC [df:abc]');
    expect(a).toEqual({
      reached: true,
      ok: true,
      status: 'active',
      instanceId: 'act-1',
      instanceName: 'MY-PC [df:abc]',
      expiresAt: null,
      variant: 'monthly',
    });
    const { url, init, body } = sent(fetch);
    expect(url).toBe('https://api.polar.sh/v1/customer-portal/license-keys/activate');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(body).toEqual({ organization_id: ORG, key: 'POLAR-KEY-1234', label: 'MY-PC [df:abc]' });
  });
  it('talks to the sandbox only when the build says so', async () => {
    const fetch = reply(200, {
      status: 'granted',
      benefit_id: YEARLY,
      activation: { id: 'a', label: 'pc' },
    });
    const sandbox = { ...CONFIG, polar: { ...CONFIG.polar, sandbox: true } };
    await new PolarProvider(sandbox, fetch).validate('POLAR-KEY-1234', 'a');
    expect(sent(fetch).url).toBe(
      'https://sandbox-api.polar.sh/v1/customer-portal/license-keys/validate',
    );
  });
  it('validates against the held activation and reports its label and plan', async () => {
    const fetch = reply(200, {
      status: 'granted',
      benefit_id: LIFETIME,
      expires_at: null,
      activation: { id: 'act-9', label: 'PC [df:00ff]' },
    });
    const v = await new PolarProvider(CONFIG, fetch).validate('POLAR-KEY-1234', 'act-9');
    expect(v).toMatchObject({
      ok: true,
      instanceId: 'act-9',
      instanceName: 'PC [df:00ff]',
      variant: 'lifetime',
    });
    expect(sent(fetch).body).toEqual({
      organization_id: ORG,
      key: 'POLAR-KEY-1234',
      activation_id: 'act-9',
    });
  });
  it('asks validate for the benefit when the activate answer has none', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json(200, { id: 'act-2', label: 'pc', license_key: { status: 'granted' } }),
      )
      .mockResolvedValueOnce(
        json(200, {
          status: 'granted',
          benefit_id: YEARLY,
          activation: { id: 'act-2', label: 'pc' },
        }),
      );
    const a = await new PolarProvider(CONFIG, fetch).activate('POLAR-KEY-1234', 'pc');
    expect(a).toMatchObject({ ok: true, variant: 'yearly', instanceId: 'act-2' });
    expect(sent(fetch, 1).url).toMatch(/\/validate$/);
  });
  it('refuses a key from another of our benefits and gives its seat back', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json(200, { id: 'act-3', label: 'pc', license_key: { benefit_id: 'b-other' } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await new PolarProvider(CONFIG, fetch).activate('POLAR-KEY-1234', 'pc')).toEqual({
      reached: true,
      ok: false,
      status: 'invalid',
      error: 'wrong-product',
    });
    expect(sent(fetch, 1)).toMatchObject({
      url: 'https://api.polar.sh/v1/customer-portal/license-keys/deactivate',
      body: { organization_id: ORG, key: 'POLAR-KEY-1234', activation_id: 'act-3' },
    });
    const v = reply(200, { status: 'granted', benefit_id: 'b-other', activation: null });
    expect(await new PolarProvider(CONFIG, v).validate('POLAR-KEY-1234', '')).toMatchObject({
      ok: false,
      error: 'wrong-product',
    });
  });
  it('maps an unknown key to bad-key, the seat limit to limit and a lapsed key to expired', async () => {
    const p = (status: number, body: unknown) => new PolarProvider(CONFIG, reply(status, body));
    expect(
      await p(404, { error: 'ResourceNotFound', detail: 'License key not found' }).activate(
        'KEY-00000',
        'pc',
      ),
    ).toMatchObject({ reached: true, ok: false, error: 'bad-key' });
    expect(
      await p(403, {
        error: 'NotPermitted',
        detail: 'License key only supports 1 activations.',
      }).activate('KEY-00000', 'pc'),
    ).toMatchObject({ reached: true, ok: false, error: 'limit' });
    expect(
      await p(403, { error: 'NotPermitted', detail: 'License key is no longer active.' }).activate(
        'KEY-00000',
        'pc',
      ),
    ).toMatchObject({ reached: true, ok: false, status: 'expired' });
    expect(
      await p(422, {
        detail: [{ loc: ['body', 'key'], msg: 'bad', type: 'value_error' }],
      }).activate('K', 'pc'),
    ).toMatchObject({ reached: true, ok: false, error: 'bad-key' });
    // validate has no "expired": a lapsed key or a lost activation is a 404, which the service turns into a re-activation
    expect(
      await p(404, { error: 'ResourceNotFound', detail: 'License key not found' }).validate(
        'KEY-00000',
        'a',
      ),
    ).toMatchObject({ reached: true, ok: false, status: 'invalid' });
  });
  it('treats 5xx, 429, timeouts, network errors and proxy pages as not reached', async () => {
    const answer = (status: number, body: string) =>
      new PolarProvider(
        CONFIG,
        vi.fn(async () => new Response(body, { status })),
      ).validate('KEY-12345', 'a');
    expect((await answer(500, '{}')).reached).toBe(false);
    expect((await answer(429, '{"error":"RateLimited"}')).reached).toBe(false);
    expect((await answer(403, '<html>blocked by proxy</html>')).reached).toBe(false);
    expect((await answer(403, '{"error":"Forbidden"}')).reached).toBe(false);
    expect((await answer(422, '{"detail":"not a list"}')).reached).toBe(false);
    const thrown = new PolarProvider(
      CONFIG,
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    );
    expect((await thrown.activate('KEY-12345', 'pc')).reached).toBe(false);
    const slow = new PolarProvider(
      CONFIG,
      (_u, init) =>
        new Promise((_res, rej) =>
          init.signal?.addEventListener('abort', () => rej(new Error('aborted'))),
        ),
      20,
    );
    expect((await slow.validate('KEY-12345', 'a')).reached).toBe(false);
  });
  it('deactivates the held activation (204 is reached)', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await new PolarProvider(CONFIG, fetch).deactivate('KEY-12345', 'act-1')).toEqual({
      reached: true,
    });
    expect(sent(fetch).body).toEqual({
      organization_id: ORG,
      key: 'KEY-12345',
      activation_id: 'act-1',
    });
  });
});

describe('Polar through the license service', () => {
  let dir: string;
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'df-polar-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const service = (fetch: ReturnType<typeof vi.fn>) =>
    createLicenseService({
      provider: new PolarProvider(CONFIG, fetch),
      settingsStore: createSettingsStore(dir, log),
      founderVerifier: createFounderVerifier('none'),
      log,
      enforced: true,
      hostname: () => 'PC',
    });

  it('a paste makes the PC Pro, a check keeps it, and a lapsed subscription drops it to Free', async () => {
    const polar = fakePolar({ 'POLAR-KEY-MONTH': { benefit: MONTHLY, limit: 1, granted: true } });
    const svc = service(polar.fetch);
    expect((await svc.activate('POLAR-KEY-MONTH')).tier).toBe('pro');
    expect((await svc.check()).tier).toBe('pro');
    expect(polar.acts.size).toBe(1);
    polar.keys['POLAR-KEY-MONTH']!.granted = false; // Polar revokes the key when the subscription ends
    const after = await svc.check();
    expect(after.tier).toBe('free');
  });
  it('pasting the same key again reuses the seat instead of using a second one', async () => {
    const polar = fakePolar({ 'POLAR-KEY-YEAR1': { benefit: YEARLY, limit: 1, granted: true } });
    const svc = service(polar.fetch);
    await svc.activate('POLAR-KEY-YEAR1');
    expect((await svc.activate('POLAR-KEY-YEAR1')).tier).toBe('pro');
    expect(polar.acts.size).toBe(1);
  });
  it('Polar being down keeps Pro (offline grace) and Remove frees the seat', async () => {
    const polar = fakePolar({ 'POLAR-KEY-LIFE1': { benefit: LIFETIME, limit: 1, granted: true } });
    const svc = service(polar.fetch);
    await svc.activate('POLAR-KEY-LIFE1');
    polar.setDown(true);
    expect((await svc.check()).tier).toBe('pro');
    polar.setDown(false);
    expect((await svc.remove()).tier).toBe('free');
    expect(polar.acts.size).toBe(0);
  });
  it('a key for a benefit that is not DualForge Pro stays Free and uses no seat', async () => {
    const polar = fakePolar({ 'POLAR-KEY-OTHER': { benefit: 'b-other', limit: 1, granted: true } });
    const svc = service(polar.fetch);
    expect((await svc.activate('POLAR-KEY-OTHER')).tier).toBe('free');
    expect(polar.acts.size).toBe(0);
  });
});
