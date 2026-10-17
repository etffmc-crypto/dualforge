import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configFromEnv, resolveLicenseMode } from '../../src/main/licensing/config.js';
import { FakeLicenseProvider, FAKE_SERVER_FILE } from '../../src/main/licensing/fake.js';
import { createFounderVerifier } from '../../src/main/licensing/founder.js';
import { LemonSqueezyProvider } from '../../src/main/licensing/lemonsqueezy.js';
import type { LicenseProvider, ProviderAnswer } from '../../src/main/licensing/provider.js';
import { createLicenseService } from '../../src/main/licensing/service.js';
import { createProfileStore } from '../../src/main/profile-store.js';
import { registerIpc } from '../../src/main/register-ipc.js';
import { createSettingsStore } from '../../src/main/settings-store.js';
import { validPayload } from '../../../../scripts/license-tool.mjs';
import { FounderPayloadSchema } from '../../src/main/licensing/founder.js';

let dir: string;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'df-licfix-'));
  log.warn.mockClear();
  writeFileSync(
    join(dir, FAKE_SERVER_FILE),
    JSON.stringify({
      keys: {
        'FAKE-AAAA-0001': { status: 'active', variant: 'monthly', limit: 1 },
        'FAKE-BBBB-0002': { status: 'active', variant: 'yearly', limit: 1 },
      },
    }),
  );
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function service(provider: LicenseProvider) {
  return createLicenseService({
    provider,
    settingsStore: createSettingsStore(dir, log),
    founderVerifier: createFounderVerifier('none'),
    log,
    enforced: true,
    hostname: () => 'PC',
  });
}

describe('review fixes', () => {
  it('a packaged build never honours the fake provider', () => {
    const env = { DUALFORGE_LICENSE_PROVIDER: 'fake', DUALFORGE_DATA_DIR: dir };
    expect(resolveLicenseMode(configFromEnv({}), env, false)).toEqual({ kind: 'dormant' });
    expect(resolveLicenseMode(configFromEnv({}), env, true).kind).toBe('fake');
  });

  it('a 429 or a non-JSON error page is "not reached", a License API refusal is not', async () => {
    const cfg = configFromEnv({ DUALFORGE_LS_STORE_ID: '1', DUALFORGE_LS_PRODUCT_IDS: '2' });
    const answer = (status: number, body: string) =>
      new LemonSqueezyProvider(
        cfg,
        vi.fn(async () => new Response(body, { status })),
      ).validate('KEY-12345', 'i');
    expect((await answer(429, '{"error":"Too Many Attempts."}')).reached).toBe(false);
    expect((await answer(403, '<html>blocked by proxy</html>')).reached).toBe(false);
    expect((await answer(407, '{}')).reached).toBe(false);
    expect(await answer(404, '{"valid":false,"error":"license_key not found."}')).toMatchObject({
      reached: true,
      error: 'bad-key',
    });
  });

  it('pasting the same key again re-activates when the held instance is gone', async () => {
    const fake = new FakeLicenseProvider(dir);
    const svc = service(fake);
    await svc.activate('FAKE-AAAA-0001');
    const gone: ProviderAnswer = { reached: true, ok: false, status: 'invalid', error: 'bad-key' };
    vi.spyOn(fake, 'validate').mockResolvedValueOnce(gone);
    const activate = vi.spyOn(fake, 'activate');
    // the store lost our instance (deleted in the dashboard), so the seat is free again
    (fake as unknown as { instances: Map<string, Set<string>> }).instances.clear();
    const v = await svc.activate('FAKE-AAAA-0001');
    expect(activate).toHaveBeenCalledTimes(1);
    expect(v.tier).toBe('pro');
  });

  it('a different key frees the old key seat on the store', async () => {
    const fake = new FakeLicenseProvider(dir);
    const svc = service(fake);
    await svc.activate('FAKE-AAAA-0001');
    const deactivate = vi.spyOn(fake, 'deactivate');
    expect((await svc.activate('FAKE-BBBB-0002')).variant).toBe('yearly');
    expect(deactivate).toHaveBeenCalledWith('FAKE-AAAA-0001', expect.any(String));
    // so key A (limit 1) activates on another PC
    expect((await new FakeLicenseProvider(dir).activate('FAKE-AAAA-0001')).ok).toBe(true);
  });

  it('an odd expiry from the store is stored as ISO or blank, never breaking the save', async () => {
    const odd: LicenseProvider = {
      name: 'odd',
      activate: async () => ({
        reached: true,
        ok: true,
        status: 'active',
        instanceId: 'i',
        expiresAt: 'x'.repeat(500),
        variant: 'monthly',
      }),
      validate: async () => ({
        reached: true,
        ok: true,
        status: 'active',
        expiresAt: '2026-11-16 10:00:00',
      }),
      deactivate: async () => ({ reached: true }),
    };
    const svc = service(odd);
    expect(await svc.activate('KEY-ODD-1234')).toMatchObject({ tier: 'pro', expiresAt: '' });
    expect((await svc.check()).expiresAt).toMatch(/^2026-11-16T/);
  });

  it('a failing background check is logged, not an unhandled rejection', async () => {
    vi.useFakeTimers();
    try {
      const broken: LicenseProvider = {
        name: 'broken',
        activate: async () => {
          throw new Error('boom');
        },
        validate: async () => {
          throw new Error('boom');
        },
        deactivate: async () => ({ reached: true }),
      };
      const settings = createSettingsStore(dir, log);
      settings.setLicense({
        ...settings.getLicense(),
        key: 'KEY-12345678',
        instanceId: 'i',
        status: 'active',
      });
      const svc = createLicenseService({
        provider: broken,
        settingsStore: settings,
        founderVerifier: createFounderVerifier('none'),
        log,
        enforced: true,
      });
      svc.start();
      await vi.waitFor(() =>
        expect(log.warn).toHaveBeenCalledWith({ code: 'E_LICENSE_CHECK', msg: 'boom' }),
      );
      svc.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('settings:set cannot switch to slot 3 or 4 on Free', () => {
    const handlers = new Map<string, (...a: unknown[]) => unknown>();
    registerIpc({
      ipc: { handle: (ch, fn) => handlers.set(ch, (...a) => fn({}, ...a)) },
      dialog: {
        showSaveDialog: async () => ({ canceled: true }),
        showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      },
      store: createProfileStore(dir, log),
      settings: createSettingsStore(dir, log),
      engine: { send: () => undefined },
      license: { entitlements: () => ({ tier: 'free', enforced: true }) },
      notifyActive: () => undefined,
      log,
      processes: async () => [],
    });
    const set = handlers.get('settings:set')!;
    expect(() => set({ activeProfile: 'p3' })).toThrow('E_LICENSE_PRO');
    expect(set({ activeProfile: 'p2' })).toMatchObject({ activeProfile: 'p2' });
  });

  it('the tool and the app agree on the founder payload limits', () => {
    const base = {
      v: 1,
      id: 'k',
      kind: 'founder',
      name: 'Test Founder',
      issuedAt: '2026-10-16T00:00:00Z',
      expiresAt: null,
      note: '',
    };
    for (const p of [
      base,
      { ...base, name: 'x'.repeat(101) },
      { ...base, note: 'x'.repeat(501) },
      { ...base, id: '' },
      { ...base, kind: 'boss' },
      { ...base, v: 2 },
      { ...base, issuedAt: 5 },
    ])
      expect(validPayload(p)).toBe(FounderPayloadSchema.safeParse(p).success);
  });
});
