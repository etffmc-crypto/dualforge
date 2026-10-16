import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultProfile, LICENSE_COPY, type LicenseView } from '@dualforge/shared';
import { FakeLicenseProvider, FAKE_SERVER_FILE } from '../../src/main/licensing/fake.js';
import { createFounderVerifier } from '../../src/main/licensing/founder.js';
import type { LicenseProvider } from '../../src/main/licensing/provider.js';
import {
  createLicenseService,
  OFFLINE_GRACE_DAYS,
  WAKE_EVERY_MS,
} from '../../src/main/licensing/service.js';
import { createProfileStore } from '../../src/main/profile-store.js';
import { createSettingsStore } from '../../src/main/settings-store.js';
import { signKey } from '../../../../scripts/license-tool.mjs';

const DAY = 86_400_000;
const START = Date.parse('2026-10-16T12:00:00Z');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const PEM = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const PUB = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const founderKey = (over: object = {}) =>
  signKey(
    {
      v: 1,
      id: 'f-1',
      kind: 'founder',
      name: 'Ryda',
      issuedAt: '2026-10-16T00:00:00Z',
      expiresAt: null,
      note: '',
      ...over,
    },
    PEM,
  );

let dir: string;
let now: number;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
type Server = { keys: Record<string, object>; down?: boolean };
const server = (s: Server) => writeFileSync(join(dir, FAKE_SERVER_FILE), JSON.stringify(s));
const KEYS = {
  'FAKE-MONTHLY': {
    status: 'active',
    variant: 'monthly',
    expiresAt: '2026-11-16T00:00:00Z',
    limit: 2,
  },
  'FAKE-LIFETIME': { status: 'active', variant: 'lifetime', expiresAt: null, limit: 1 },
  'FAKE-WRONGPRODUCT': { status: 'active', wrongProduct: true },
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'df-lic-'));
  now = START;
  log.info.mockClear();
  log.warn.mockClear();
  server({ keys: KEYS });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function rig(o: { enforced?: boolean; provider?: LicenseProvider | null } = {}) {
  const settings = createSettingsStore(dir, log);
  const changes: { view: LicenseView; tierChanged: boolean }[] = [];
  const provider = o.provider === undefined ? new FakeLicenseProvider(dir) : o.provider;
  const svc = createLicenseService({
    provider,
    settingsStore: settings,
    founderVerifier: createFounderVerifier(PUB),
    clock: { now: () => now },
    log,
    enforced: o.enforced ?? true,
    checkoutUrl: 'https://example.com/buy',
    hostname: () => 'TEST-PC',
    onChange: (view, tierChanged) => changes.push({ view, tierChanged }),
  });
  return { svc, settings, changes, provider };
}
const fileLicense = (): object | undefined => {
  const f = join(dir, 'settings.json');
  if (!existsSync(f)) return undefined;
  return (JSON.parse(readFileSync(f, 'utf8')) as { license?: object }).license;
};

describe('license service: activation', () => {
  it('starts on Free with nothing saved', () => {
    const { svc } = rig();
    expect(svc.view()).toMatchObject({ enforced: true, tier: 'free', source: 'none', message: '' });
    expect(svc.entitlements()).toEqual({ tier: 'free', enforced: true });
  });
  it('a good store key makes the PC Pro at once and is saved', async () => {
    const { svc, changes } = rig();
    const v = await svc.activate('  FAKE-MONTHLY ');
    expect(v).toMatchObject({
      tier: 'pro',
      source: 'key',
      status: 'active',
      variant: 'monthly',
      expiresAt: '2026-11-16T00:00:00Z',
      keyHint: 'THLY',
      lastCheck: new Date(START).toISOString(),
      message: '',
    });
    expect(changes.at(-1)!.tierChanged).toBe(true);
    expect(svc.entitlements().tier).toBe('pro');
    expect(fileLicense()).toMatchObject({ key: 'FAKE-MONTHLY', status: 'active' });
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'LICENSE_ACTIVATED', keyHint: 'THLY' }),
    );
    expect(JSON.stringify(log.info.mock.calls)).not.toContain('FAKE-MONTHLY');
  });
  it('keyHint shows only the last 4 characters', async () => {
    const { svc } = rig();
    expect((await svc.activate('FAKE-MONTHLY')).keyHint).toBe('THLY');
  });
  it('a bad key stays Free with the DF-023 message and saves nothing', async () => {
    const { svc } = rig();
    expect(await svc.activate('NOT-A-REAL-KEY')).toMatchObject({
      tier: 'free',
      message: LICENSE_COPY.badKey,
    });
    expect(await svc.activate('short')).toMatchObject({ message: LICENSE_COPY.badKey });
    expect(fileLicense()).toBeUndefined();
  });
  it('the activation limit has its own message', async () => {
    server({ keys: { 'FAKE-ONEPC': { status: 'active', limit: 1 } } });
    const other = new FakeLicenseProvider(dir);
    await other.activate('FAKE-ONEPC'); // another PC holds the only seat
    const { svc } = rig({ provider: other });
    expect(await svc.activate('FAKE-ONEPC')).toMatchObject({
      tier: 'free',
      message: LICENSE_COPY.limit,
    });
  });
  it('a key for another product is refused', async () => {
    const { svc } = rig();
    expect(await svc.activate('FAKE-WRONGPRODUCT')).toMatchObject({
      tier: 'free',
      message: LICENSE_COPY.badKey,
    });
  });
  it('unreachable on activation: still Free, offline message, nothing saved', async () => {
    server({ keys: KEYS, down: true });
    const { svc } = rig();
    expect(await svc.activate('FAKE-MONTHLY')).toMatchObject({
      tier: 'free',
      message: LICENSE_COPY.offlineActivate,
    });
    expect(fileLicense()).toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_LICENSE_CHECK' }));
  });
  it('a refused new key never replaces a working one', async () => {
    const { svc } = rig();
    await svc.activate('FAKE-MONTHLY');
    expect(await svc.activate('NOT-A-REAL-KEY')).toMatchObject({
      tier: 'pro',
      keyHint: 'THLY',
      message: LICENSE_COPY.badKey,
    });
  });
});

describe('license service: checks and lapses', () => {
  it('the daily check validates once the last good check is 24 h old', async () => {
    const { svc, provider } = rig();
    await svc.activate('FAKE-MONTHLY');
    const validate = vi.spyOn(provider!, 'validate');
    now += DAY - 1000;
    await svc.maybeCheck();
    expect(validate).not.toHaveBeenCalled();
    now += 2000;
    expect(await svc.maybeCheck()).toMatchObject({
      tier: 'pro',
      lastCheck: new Date(now).toISOString(),
    });
    expect(validate).toHaveBeenCalledTimes(1);
  });
  it('start() checks at once and then on the hourly wake', async () => {
    vi.useFakeTimers();
    try {
      const { svc, provider } = rig();
      await svc.activate('FAKE-MONTHLY');
      const validate = vi.spyOn(provider!, 'validate');
      now += 2 * DAY;
      svc.start();
      await vi.waitFor(() => expect(validate).toHaveBeenCalledTimes(1));
      now += 2 * DAY;
      await vi.advanceTimersByTimeAsync(WAKE_EVERY_MS);
      expect(validate).toHaveBeenCalledTimes(2);
      svc.stop();
    } finally {
      vi.useRealTimers();
    }
  });
  for (const [status, copy] of [
    ['expired', LICENSE_COPY.lapsedExpired],
    ['disabled', LICENSE_COPY.lapsedDisabled],
  ] as const) {
    it(`a ${status} key drops to Free with its message and keeps every profile`, async () => {
      const profiles = createProfileStore(dir, log);
      const mine = { ...defaultProfile('p3', 'Mine'), gyro: { ...defaultProfile('p3', 'x').gyro } };
      mine.mappings.cross = {
        targets: [{ type: 'key', code: 'VK_SPACE' }],
        turbo: { mode: 'hold', hz: 12 },
        continuous: false,
      };
      profiles.set(mine);
      const before = readFileSync(join(dir, 'profiles', 'p3.json'), 'utf8');
      const { svc, changes } = rig();
      await svc.activate('FAKE-MONTHLY');
      server({ keys: { ...KEYS, 'FAKE-MONTHLY': { ...KEYS['FAKE-MONTHLY'], status } } });
      const v = await svc.check();
      expect(v).toMatchObject({ tier: 'free', status, message: copy, keyHint: 'THLY' });
      expect(changes.at(-1)!.tierChanged).toBe(true);
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'LICENSE_LAPSED', status }),
      );
      expect(readFileSync(join(dir, 'profiles', 'p3.json'), 'utf8')).toBe(before);
    });
  }
  it('offline within 14 days keeps Pro with the grace message; past 14 days drops to Free', async () => {
    const { svc } = rig();
    await svc.activate('FAKE-MONTHLY');
    server({ keys: KEYS, down: true });
    now += 3 * DAY;
    expect(await svc.check()).toMatchObject({
      tier: 'pro',
      message: "Couldn't reach the license server. Pro stays on for 11 more days.",
    });
    now = START + OFFLINE_GRACE_DAYS * DAY - 1000;
    expect((await svc.maybeCheck()).tier).toBe('pro');
    now = START + (OFFLINE_GRACE_DAYS + 1) * DAY;
    const v = await svc.maybeCheck();
    expect(v.tier).toBe('free');
    expect(v.message).toBe(
      "Couldn't reach the license server for 15 days, so this PC is back on Free. Check now when you're online.",
    );
    // the E_LICENSE_CHECK warning is logged at most once a day
    expect(log.warn.mock.calls.filter(([o]) => o.code === 'E_LICENSE_CHECK').length).toBe(3);
    server({ keys: KEYS });
    expect(await svc.check()).toMatchObject({ tier: 'pro', message: '' });
  });
  it('reactivating the same key after a lapse validates the held instance', async () => {
    const { svc, provider } = rig();
    await svc.activate('FAKE-MONTHLY');
    server({ keys: { ...KEYS, 'FAKE-MONTHLY': { ...KEYS['FAKE-MONTHLY'], status: 'expired' } } });
    expect((await svc.check()).tier).toBe('free');
    server({ keys: KEYS });
    const activate = vi.spyOn(provider!, 'activate');
    expect(await svc.activate('FAKE-MONTHLY')).toMatchObject({ tier: 'pro', message: '' });
    expect(activate).not.toHaveBeenCalled(); // no second seat used
  });
  it('remove deactivates, clears the block and goes back to Free; profiles untouched', async () => {
    const profiles = createProfileStore(dir, log);
    profiles.set(defaultProfile('p4', 'Four'));
    const { svc, provider } = rig();
    await svc.activate('FAKE-MONTHLY');
    const deactivate = vi.spyOn(provider!, 'deactivate');
    const v = await svc.remove();
    expect(v).toMatchObject({ tier: 'free', source: 'none', hasLicense: false, keyHint: '' });
    expect(deactivate).toHaveBeenCalledWith('FAKE-MONTHLY', expect.any(String));
    expect(fileLicense()).toBeUndefined();
    expect(createProfileStore(dir, log).get('p4').name).toBe('Four');
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ code: 'LICENSE_REMOVED' }));
  });
  it('remove works offline too (best effort)', async () => {
    const { svc } = rig();
    await svc.activate('FAKE-MONTHLY');
    server({ keys: KEYS, down: true });
    expect((await svc.remove()).tier).toBe('free');
  });
});

describe('license service: restart and hand edits', () => {
  it('a restart re-derives the tier from the saved block', async () => {
    await rig().svc.activate('FAKE-LIFETIME');
    const again = rig();
    expect(again.svc.entitlements()).toEqual({ tier: 'pro', enforced: true });
    expect(again.svc.view()).toMatchObject({ variant: 'lifetime', expiresAt: '' });
    now += (OFFLINE_GRACE_DAYS + 2) * DAY; // a restart long after the last check, before any network answer
    expect(rig().svc.entitlements().tier).toBe('free');
  });
  it('a hand-edited license block grants nothing', () => {
    const write = (license: object) =>
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({ schemaVersion: 1, license }));
    write({ tier: 'pro', status: 'active', lastCheck: new Date(START).toISOString() }); // no key
    expect(rig().svc.entitlements().tier).toBe('free');
    write({ key: 'MADE-UP-KEY', status: 'active' }); // never checked
    expect(rig().svc.entitlements().tier).toBe('free');
    write({ key: 'MADE-UP-KEY', status: 'active', lastCheck: '2099-01-01T00:00:00Z' }); // from the future
    expect(rig().svc.entitlements().tier).toBe('free');
    write({ founderKey: 'DFKEY1.eyJ2IjoxfQ.AAAA' }); // not signed by our key
    expect(rig().svc.entitlements().tier).toBe('free');
    write({ key: 'MADE-UP-KEY', status: 'founder' }); // not a valid status: the block is dropped
    expect(rig().svc.view()).toMatchObject({ tier: 'free', hasLicense: false });
  });
});

describe('license service: founder keys', () => {
  it('a good founder key is Pro offline, with its badge source and name', async () => {
    server({ keys: {}, down: true });
    const { svc } = rig();
    const v = await svc.activate(founderKey());
    expect(v).toMatchObject({
      tier: 'pro',
      source: 'founder',
      founderName: 'Ryda',
      variant: 'founder-lifetime',
      expiresAt: '',
    });
    expect(rig().svc.entitlements().tier).toBe('pro'); // and after a restart
  });
  it('an expiring review key shows its end date and lapses on that date', async () => {
    const { svc } = rig();
    const v = await svc.activate(founderKey({ kind: 'review', expiresAt: '2026-10-20T00:00:00Z' }));
    expect(v).toMatchObject({ tier: 'pro', expiresAt: '2026-10-20T00:00:00Z' });
    now = Date.parse('2026-10-21T00:00:00Z');
    expect((await svc.maybeCheck()).tier).toBe('free');
  });
  it('tampered, wrong-prefix, expired and other-keypair founder keys are refused', async () => {
    const { svc } = rig();
    const good = founderKey();
    const other = generateKeyPairSync('ed25519').privateKey.export({
      format: 'pem',
      type: 'pkcs8',
    });
    for (const bad of [
      good.slice(0, -3) + (good.endsWith('A') ? 'BBB' : 'AAA'),
      good.replace('DFKEY1.', 'DFKEY1.x'),
      founderKey({ expiresAt: '2026-01-01T00:00:00Z' }),
      signKey(
        { v: 1, id: 'x', kind: 'founder', name: 'X', issuedAt: '', expiresAt: null, note: '' },
        other.toString(),
      ),
    ]) {
      expect(await svc.activate(bad)).toMatchObject({ tier: 'free', message: LICENSE_COPY.badKey });
    }
    expect(fileLicense()).toBeUndefined();
  });
});

describe('license service: dormant', () => {
  it('makes no provider call and stays not enforced', async () => {
    const provider: LicenseProvider = {
      name: 'spy',
      activate: vi.fn(),
      validate: vi.fn(),
      deactivate: vi.fn(),
    };
    const { svc } = rig({ enforced: false, provider });
    expect(svc.entitlements()).toEqual({ tier: 'free', enforced: false });
    await svc.activate('FAKE-MONTHLY');
    await svc.check();
    await svc.maybeCheck();
    await svc.remove();
    svc.start();
    svc.stop();
    expect(provider.activate).not.toHaveBeenCalled();
    expect(provider.validate).not.toHaveBeenCalled();
    expect(provider.deactivate).not.toHaveBeenCalled();
    expect(svc.view()).toMatchObject({ enforced: false, message: '' });
  });
  it('a dormant build ignores a saved block', () => {
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ schemaVersion: 1, license: { founderKey: founderKey() } }),
    );
    expect(rig({ enforced: false, provider: null }).svc.view()).toMatchObject({
      enforced: false,
      tier: 'free',
    });
  });
});
