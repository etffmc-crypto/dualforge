import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { createFounderVerifier, FOUNDER_PREFIX } from '../../src/main/licensing/founder.js';
import { FOUNDER_PUBLIC_KEY } from '../../src/main/licensing/founder-key.js';
import { signKey } from '../../../../scripts/license-tool.mjs';

const NOW = Date.parse('2026-10-16T12:00:00Z');

/** A throwaway keypair: tests never touch the real private key. */
function keypair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    pem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    pub: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
  };
}
const payload = (over: object = {}) => ({
  v: 1,
  id: 'k-1',
  kind: 'founder',
  name: 'Ryda',
  issuedAt: '2026-10-16T00:00:00Z',
  expiresAt: null,
  note: '',
  ...over,
});

describe('founder verifier', () => {
  const kp = keypair();
  const verifier = createFounderVerifier(kp.pub);

  it('accepts a key signed by the matching private key', () => {
    const r = verifier.verify(signKey(payload(), kp.pem), NOW);
    expect(r).toMatchObject({ ok: true, payload: { name: 'Ryda', kind: 'founder' } });
  });
  it('accepts a review key with a future end date, and trims whitespace', () => {
    const line = signKey(payload({ kind: 'review', expiresAt: '2026-12-01T00:00:00Z' }), kp.pem);
    expect(verifier.verify(`  ${line}\n`, NOW).ok).toBe(true);
  });
  it('refuses a tampered payload', () => {
    const line = signKey(payload(), kp.pem);
    const [body, sig] = line.slice(FOUNDER_PREFIX.length).split('.');
    const forged = Buffer.from(
      Buffer.from(body!, 'base64url').toString().replace('Ryda', 'Mallory'),
    ).toString('base64url');
    expect(verifier.verify(`${FOUNDER_PREFIX}${forged}.${sig}`, NOW)).toEqual({
      ok: false,
      error: 'signature',
    });
  });
  it('refuses a flipped signature bit', () => {
    const line = signKey(payload(), kp.pem);
    const [body, sig] = line.slice(FOUNDER_PREFIX.length).split('.');
    const bytes = Buffer.from(sig!, 'base64url');
    bytes[0] = bytes[0]! ^ 1;
    expect(verifier.verify(`${FOUNDER_PREFIX}${body}.${bytes.toString('base64url')}`, NOW).ok).toBe(
      false,
    );
  });
  it('refuses a wrong prefix and a malformed line', () => {
    const line = signKey(payload(), kp.pem);
    expect(verifier.verify(line.replace('DFKEY1.', 'DFKEY2.'), NOW)).toEqual({
      ok: false,
      error: 'prefix',
    });
    expect(verifier.verify('DFKEY1.onlyonepart', NOW)).toEqual({ ok: false, error: 'format' });
  });
  it('refuses an expired key', () => {
    const line = signKey(payload({ expiresAt: '2026-10-01T00:00:00Z' }), kp.pem);
    expect(verifier.verify(line, NOW)).toEqual({ ok: false, error: 'expired' });
  });
  it('refuses a key from another keypair', () => {
    const other = keypair();
    expect(verifier.verify(signKey(payload(), other.pem), NOW)).toEqual({
      ok: false,
      error: 'signature',
    });
  });
  it('refuses a validly signed payload of the wrong shape', () => {
    expect(verifier.verify(signKey({ v: 2, name: 'x' }, kp.pem), NOW)).toEqual({
      ok: false,
      error: 'payload',
    });
  });
  it('the built-in public key is a usable Ed25519 key that our test keys do not match', () => {
    const builtIn = createFounderVerifier(FOUNDER_PUBLIC_KEY);
    expect(builtIn.verify(signKey(payload(), kp.pem), NOW)).toEqual({
      ok: false,
      error: 'signature',
    });
    expect(Buffer.from(FOUNDER_PUBLIC_KEY, 'base64')).toHaveLength(44); // SPKI DER of an Ed25519 key
  });
  it('a broken public key refuses everything', () => {
    expect(createFounderVerifier('nope').verify(signKey(payload(), kp.pem), NOW).ok).toBe(false);
  });
});
