import { describe, expect, it, vi } from 'vitest';
import { PolarProvider } from '../../src/main/licensing/polar.js';

const CONFIG = {
  organizationId: 'org-1',
  benefits: { monthly: 'b-m', yearly: 'b-y', lifetime: 'b-l' },
};
const KEY = {
  organization_id: 'org-1',
  benefit_id: 'b-m',
  status: 'granted',
  expires_at: '2026-12-01T00:00:00Z',
};

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
const sent = (f: ReturnType<typeof reply>) => f.mock.calls[0] as unknown as [string, RequestInit];

describe('Polar provider', () => {
  it('activates with a JSON POST to the fixed customer-portal URL', async () => {
    const fetch = reply(200, { id: 'act-1', label: 'MY-PC', license_key: KEY });
    const a = await new PolarProvider(CONFIG, fetch).activate('KEY-1234', 'MY-PC');
    expect(a).toEqual({
      reached: true,
      ok: true,
      status: 'active',
      instanceId: 'act-1',
      instanceName: 'MY-PC',
      expiresAt: '2026-12-01T00:00:00Z',
      variant: 'monthly',
    });
    const [url, init] = sent(fetch);
    expect(url).toBe('https://api.polar.sh/v1/customer-portal/license-keys/activate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      key: 'KEY-1234',
      label: 'MY-PC',
      organization_id: 'org-1',
    });
  });
  it('validates by activation id and reads a lifetime key', async () => {
    const fetch = reply(200, {
      ...KEY,
      benefit_id: 'b-l',
      expires_at: null,
      activation: { id: 'act-1', label: 'MY-PC' },
    });
    const a = await new PolarProvider(CONFIG, fetch).validate('KEY-1234', 'act-1');
    expect(a).toMatchObject({
      ok: true,
      expiresAt: null,
      variant: 'lifetime',
      instanceId: 'act-1',
    });
    expect(JSON.parse(String(sent(fetch)[1].body))).toEqual({
      key: 'KEY-1234',
      activation_id: 'act-1',
      organization_id: 'org-1',
    });
  });
  it('refuses another organization or a benefit not in the list as wrong-product', async () => {
    for (const k of [
      { ...KEY, organization_id: 'org-2' },
      { ...KEY, benefit_id: 'other' },
    ]) {
      const a = await new PolarProvider(CONFIG, reply(200, { id: 'a', license_key: k })).activate(
        'K',
        'pc',
      );
      expect(a).toEqual({ reached: true, ok: false, status: 'invalid', error: 'wrong-product' });
    }
  });
  it('maps 404 to bad-key and a 403 limit, expired and disabled to their errors', async () => {
    const nf = reply(404, { error: 'ResourceNotFound', detail: 'License key does not exist.' });
    expect(await new PolarProvider(CONFIG, nf).validate('K', 'a')).toMatchObject({
      reached: true,
      ok: false,
      error: 'bad-key',
    });
    const lim = reply(403, {
      error: 'NotPermitted',
      detail: 'License key activation limit already reached',
    });
    expect(await new PolarProvider(CONFIG, lim).activate('K', 'pc')).toMatchObject({
      ok: false,
      error: 'limit',
    });
    const exp = reply(403, { error: 'NotPermitted', detail: 'License key is expired' });
    expect(await new PolarProvider(CONFIG, exp).activate('K', 'pc')).toMatchObject({
      status: 'expired',
    });
    const dis = reply(403, { error: 'NotPermitted', detail: 'License key is revoked' });
    expect(await new PolarProvider(CONFIG, dis).activate('K', 'pc')).toMatchObject({
      status: 'disabled',
    });
  });
  it('treats 5xx, 429, timeouts, network errors, non-Polar bodies and foreign 403s as unreachable', async () => {
    const cases = [
      reply(503, { error: 'x' }),
      reply(429, {}),
      vi.fn(async () => {
        throw new Error('offline');
      }),
      vi.fn(async () => new Response('<html>portal</html>', { status: 200 })),
      reply(403, { error: 'Forbidden' }),
    ];
    for (const f of cases)
      expect(await new PolarProvider(CONFIG, f).validate('K', 'a')).toMatchObject({
        reached: false,
        error: 'unreachable',
      });
    const hang = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(new Error('aborted')));
        }),
    );
    expect(await new PolarProvider(CONFIG, hang, 5).validate('K', 'a')).toMatchObject({
      reached: false,
    });
  });
  it('deactivates (204) and reports reached', async () => {
    const fetch = reply(204);
    expect(await new PolarProvider(CONFIG, fetch).deactivate('K', 'act-1')).toEqual({
      reached: true,
    });
    expect(sent(fetch)[0]).toMatch(/license-keys\/deactivate$/);
    expect(
      await new PolarProvider(
        CONFIG,
        reply(404, { error: 'ResourceNotFound', detail: 'x' }),
      ).deactivate('K', 'a'),
    ).toEqual({ reached: true });
    expect(await new PolarProvider(CONFIG, reply(500, {})).deactivate('K', 'a')).toEqual({
      reached: false,
    });
  });
});
