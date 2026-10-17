import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configFromEnv } from '../../src/main/licensing/config.js';
import { FakeLicenseProvider, FAKE_SERVER_FILE } from '../../src/main/licensing/fake.js';
import { createFounderVerifier } from '../../src/main/licensing/founder.js';
import { LemonSqueezyProvider } from '../../src/main/licensing/lemonsqueezy.js';
import {
  cachedFingerprint,
  machineFingerprint,
  parseMachineGuid,
} from '../../src/main/licensing/machine-id.js';
import { createLicenseService, instanceTag } from '../../src/main/licensing/service.js';
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
      name: 'Test Founder',
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'df-lichard-'));
  now = START;
  log.info.mockClear();
  writeFileSync(
    join(dir, FAKE_SERVER_FILE),
    JSON.stringify({
      keys: { 'FAKE-SEAT-0001': { status: 'active', variant: 'yearly', limit: 2 } },
    }),
  );
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function rig(o: { provider?: FakeLicenseProvider; fp?: string; revoked?: string[] } = {}) {
  const provider = o.provider ?? new FakeLicenseProvider(dir);
  const svc = createLicenseService({
    provider,
    settingsStore: createSettingsStore(dir, log),
    founderVerifier: createFounderVerifier(PUB, o.revoked ?? []),
    clock: { now: () => now },
    log,
    enforced: true,
    hostname: () => 'TEST-PC',
    fingerprint: () => o.fp ?? 'aaaa111122223333',
  });
  return { svc, provider };
}
const fileLicense = () =>
  (
    JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as {
      license: Record<string, string>;
    }
  ).license;

describe('machine fingerprint', () => {
  it('reads MachineGuid from reg output and hashes it, never returning the GUID', () => {
    const out =
      '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    1A2B3C4D-0000-1111-2222-333344445555\r\n';
    expect(parseMachineGuid(out)).toBe('1a2b3c4d-0000-1111-2222-333344445555');
    const fp = machineFingerprint(() => out);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    expect(fp).not.toContain('1a2b3c4d');
    expect(machineFingerprint(() => out)).toBe(fp); // stable
  });
  it('falls back to the host name when reg fails, and computes once per run', () => {
    const a = machineFingerprint(
      () => {
        throw new Error('no reg');
      },
      () => 'PC-ONE',
    );
    const b = machineFingerprint(
      () => '',
      () => 'PC-TWO',
    );
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
    const compute = vi.fn(() => 'x');
    const fp = cachedFingerprint(compute);
    fp();
    fp();
    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('a license block copied to another PC', () => {
  it('activation names the instance with this PC tag', async () => {
    const { svc, provider } = rig();
    const activate = vi.spyOn(provider, 'activate');
    expect((await svc.activate('FAKE-SEAT-0001')).tier).toBe('pro');
    expect(activate).toHaveBeenCalledWith(
      'FAKE-SEAT-0001',
      `TEST-PC ${instanceTag('aaaa111122223333')}`,
    );
  });
  it('re-activates on the other PC, so the seat limit applies', async () => {
    const provider = new FakeLicenseProvider(dir);
    const first = rig({ provider });
    await first.svc.activate('FAKE-SEAT-0001');
    const heldId = fileLicense().instanceId;
    // the same settings.json, the same store, a different machine
    const second = rig({ provider, fp: 'bbbb444455556666' });
    const activate = vi.spyOn(provider, 'activate');
    now += 2 * DAY;
    const v = await second.svc.maybeCheck();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(v.tier).toBe('pro'); // limit 2: a second seat is free
    expect(fileLicense().instanceId).not.toBe(heldId);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'LICENSE_INSTANCE_MISMATCH' }),
    );
  });
  it('on the PC that activated it, validate keeps the instance and uses no seat', async () => {
    const { svc, provider } = rig();
    await svc.activate('FAKE-SEAT-0001');
    const activate = vi.spyOn(provider, 'activate');
    now += 2 * DAY;
    expect((await svc.maybeCheck()).tier).toBe('pro');
    expect(activate).not.toHaveBeenCalled();
  });
  it('a provider that reports no instance name is not checked', async () => {
    const provider = new FakeLicenseProvider(dir);
    await rig({ provider }).svc.activate('FAKE-SEAT-0001');
    const restarted = new FakeLicenseProvider(dir); // a new run: the fake forgets instance names
    const activate = vi.spyOn(restarted, 'activate');
    now += 2 * DAY;
    expect((await rig({ provider: restarted }).svc.maybeCheck()).tier).toBe('pro');
    expect(activate).not.toHaveBeenCalled();
  });
});

describe('founder keys: revocation and the clock', () => {
  it('a revoked founder key is refused on paste and drops to Free on start', async () => {
    const line = founderKey({ id: 'gone-1' });
    expect((await rig({ revoked: ['gone-1'] }).svc.activate(line)).tier).toBe('free');
    expect((await rig().svc.activate(line)).tier).toBe('pro');
    const after = rig({ revoked: ['gone-1'] }).svc; // an update shipped the revocation
    expect(after.entitlements().tier).toBe('free');
    expect(after.view().message).not.toBe('');
  });
  it('an expiring review key is refused while the clock is set back behind what this PC saw', async () => {
    const line = founderKey({ kind: 'review', expiresAt: '2026-11-01T00:00:00Z' });
    const { svc } = rig();
    expect((await svc.activate(line)).tier).toBe('pro');
    now += 10 * DAY;
    await svc.maybeCheck(); // notes the time
    now = START + 2 * DAY; // clock wound back
    expect(rig().svc.entitlements().tier).toBe('free');
    now = START + 11 * DAY;
    expect(rig().svc.entitlements().tier).toBe('pro');
  });
  it('a lifetime founder key ignores the clock', async () => {
    const { svc } = rig();
    await svc.activate(founderKey());
    now += 30 * DAY;
    await svc.maybeCheck();
    now = START - 300 * DAY;
    expect(rig().svc.entitlements().tier).toBe('pro');
  });
  it('removing the key keeps the clock high-water mark', async () => {
    const { svc } = rig();
    await svc.activate(founderKey({ kind: 'review', expiresAt: '2026-11-01T00:00:00Z' }));
    const seen = fileLicense().seenAt;
    await svc.remove();
    expect(fileLicense().seenAt).toBe(seen);
  });
});

describe('Lemon Squeezy: whose error is it', () => {
  const answer = (status: number, body: string) =>
    new LemonSqueezyProvider(
      configFromEnv({ DUALFORGE_LS_STORE_ID: '1', DUALFORGE_LS_PRODUCT_IDS: '2' }),
      vi.fn(async () => new Response(body, { status })),
    ).validate('KEY-12345', 'i');
  it('a proxy 403 with a generic JSON error is "not reached"', async () => {
    expect((await answer(403, '{"error":"Forbidden"}')).reached).toBe(false);
    expect((await answer(502, '{"error":"Bad gateway"}')).reached).toBe(false);
  });
  it('License API reasons are the store answering', async () => {
    expect((await answer(404, '{"valid":false,"error":"instance_id not found."}')).reached).toBe(
      true,
    );
    expect(
      (
        await answer(
          400,
          '{"activated":false,"error":"This license key has reached the activation limit."}',
        )
      ).reached,
    ).toBe(true);
  });
});
