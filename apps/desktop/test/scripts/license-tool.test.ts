import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  builtInPublicKey,
  issue,
  keygen,
  main,
  publicKeyOf,
  verifyKey,
} from '../../../../scripts/license-tool.mjs';
import { FOUNDER_PUBLIC_KEY } from '../../src/main/licensing/founder-key.js';
import { createFounderVerifier } from '../../src/main/licensing/founder.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'df-ltool-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('license-tool', () => {
  it('reads the public key built into the app', () => {
    expect(builtInPublicKey()).toBe(FOUNDER_PUBLIC_KEY);
  });
  it('keygen writes a key once and refuses to overwrite it', () => {
    const p = join(dir, 'k.pem');
    const pub = keygen(p);
    expect(publicKeyOf(readFileSync(p, 'utf8'))).toBe(pub);
    expect(() => keygen(p)).toThrow(/refusing to overwrite/);
  });
  it('issues a key the app verifies, and refuses a private key that does not match', () => {
    const p = join(dir, 'k.pem');
    const pub = keygen(p);
    const { line, payload } = issue({
      name: 'Ryda',
      kind: 'founder',
      keyPath: p,
      publicKeyB64: pub,
    });
    expect(payload).toMatchObject({ v: 1, kind: 'founder', name: 'Ryda', expiresAt: null });
    expect(createFounderVerifier(pub).verify(line, Date.now()).ok).toBe(true);
    expect(verifyKey(line, pub).ok).toBe(true);
    const otherPub = keygen(join(dir, 'other.pem'));
    expect(() => issue({ name: 'X', kind: 'founder', keyPath: p, publicKeyB64: otherPub })).toThrow(
      /does not match/,
    );
    expect(() => issue({ name: 'X', kind: 'boss', keyPath: p, publicKeyB64: pub })).toThrow(
      /--kind/,
    );
  });
  it('a review key carries its end date and fails verification after it', () => {
    const p = join(dir, 'k.pem');
    const pub = keygen(p);
    const { line } = issue({
      name: 'Reviewer',
      kind: 'review',
      expires: '2026-12-31',
      keyPath: p,
      publicKeyB64: pub,
      now: new Date('2026-10-16T00:00:00Z'),
    });
    expect(verifyKey(line, pub, Date.parse('2026-11-01')).ok).toBe(true);
    expect(verifyKey(line, pub, Date.parse('2027-01-02')).error).toBe('expired');
  });
  it('the CLI issues to a file, verifies it, and never prints the private key', () => {
    const p = join(dir, 'k.pem');
    const out: string[] = [];
    expect(main(['keygen', '--key', p], (l) => out.push(l))).toBe(0);
    const pub = /Public key.*: (\S+)$/.exec(out[1]!)![1]!;
    const file = join(dir, 'ryda.dfkey');
    expect(
      main(
        [
          'issue',
          '--name',
          'Ryda',
          '--kind',
          'founder',
          '--out',
          file,
          '--key',
          p,
          '--public-key',
          pub,
        ],
        (l) => out.push(l),
      ),
    ).toBe(0);
    expect(existsSync(file)).toBe(true);
    expect(main(['verify', file, '--public-key', pub], (l) => out.push(l))).toBe(0);
    const pem = readFileSync(p, 'utf8');
    const body = pem.split('\n')[1]!;
    expect(out.join('\n')).not.toContain(body);
    expect(out.join('\n')).not.toContain('PRIVATE KEY');
    expect(main(['nope'], () => undefined)).toBe(2);
  });
});
