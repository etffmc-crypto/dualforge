#!/usr/bin/env node
// DualForge founder and review keys (docs/licensing.md). Ethan's side only; the app carries the public key.
//
//   node scripts/license-tool.mjs keygen                       create secrets/founder-ed25519.pem (refuses to overwrite)
//   node scripts/license-tool.mjs issue --name <n> --kind founder|review [--expires <date>] [--note <t>] --out <file>
//   node scripts/license-tool.mjs verify <file>
//
// Options for tests: --key <pem path> (default secrets/founder-ed25519.pem), --public-key <base64 SPKI> (default: the
// key built into the app, read from apps/desktop/src/main/licensing/founder-key.ts). The private key is never printed.
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_KEY_PATH = join(root, 'secrets', 'founder-ed25519.pem');
export const FOUNDER_KEY_SOURCE = join(root, 'apps/desktop/src/main/licensing/founder-key.ts');
export const PREFIX = 'DFKEY1.';
export const DOMAIN = 'DualForge founder key v1\n';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** The public key built into the app (base64 SPKI DER), or '' while none is set. */
export function builtInPublicKey(source = FOUNDER_KEY_SOURCE) {
  const m = /FOUNDER_PUBLIC_KEY\s*=\s*['"]([A-Za-z0-9+/=]*)['"]/.exec(readFileSync(source, 'utf8'));
  return m ? m[1] : '';
}

export const publicKeyOf = (privatePem) =>
  createPublicKey(createPrivateKey(privatePem))
    .export({ format: 'der', type: 'spki' })
    .toString('base64');

/** Writes a new Ed25519 private key (PKCS#8 PEM) to `path`; refuses when it exists. Returns the public key (base64 SPKI). */
export function keygen(path = DEFAULT_KEY_PATH) {
  if (existsSync(path)) throw new Error(`${path} already exists; refusing to overwrite it`);
  const { privateKey } = generateKeyPairSync('ed25519');
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pem, { flag: 'wx', mode: 0o600 });
  return publicKeyOf(pem);
}

/** Signs a payload into one `DFKEY1.<payload>.<signature>` line. */
export function signKey(payload, privatePem) {
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const sig = sign(
    null,
    Buffer.concat([Buffer.from(DOMAIN, 'utf8'), bytes]),
    createPrivateKey(privatePem),
  );
  return `${PREFIX}${b64url(bytes)}.${b64url(sig)}`;
}

const str = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max;
/** The app's FounderPayloadSchema (apps/desktop/src/main/licensing/founder.ts), kept in step by license-tool.test.ts. */
export function validPayload(p) {
  return (
    !!p &&
    p.v === 1 &&
    str(p.id, 1, 100) &&
    (p.kind === 'founder' || p.kind === 'review') &&
    str(p.name, 1, 100) &&
    str(p.issuedAt, 0, 64) &&
    (p.expiresAt === null || str(p.expiresAt, 0, 64)) &&
    (p.note === undefined || str(p.note, 0, 500))
  );
}

/** Checks a key line against `publicKeyB64`; returns { ok, payload?, error? } (same rules as the app's verifier). */
export function verifyKey(text, publicKeyB64, now = Date.now()) {
  const t = String(text).trim();
  if (!t.startsWith(PREFIX)) return { ok: false, error: 'prefix' };
  const parts = t.slice(PREFIX.length).split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: 'format' };
  const bytes = Buffer.from(parts[0], 'base64url');
  const sig = Buffer.from(parts[1], 'base64url');
  let good = false;
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    good = verify(null, Buffer.concat([Buffer.from(DOMAIN, 'utf8'), bytes]), key, sig);
  } catch {
    good = false;
  }
  if (!good) return { ok: false, error: 'signature' };
  let payload;
  try {
    payload = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { ok: false, error: 'payload' };
  }
  if (!validPayload(payload)) return { ok: false, error: 'payload' };
  if (payload.expiresAt !== null && !(Date.parse(payload.expiresAt) > now))
    return { ok: false, error: 'expired', payload };
  return { ok: true, payload };
}

/** Issues a key with the private key at `keyPath`; refuses a private key that does not match `publicKeyB64`. */
export function issue({
  name,
  kind,
  expires,
  note = '',
  keyPath = DEFAULT_KEY_PATH,
  publicKeyB64,
  now = new Date(),
}) {
  if (!name || !String(name).trim()) throw new Error('--name is required');
  if (String(name).trim().length > 100) throw new Error('--name: at most 100 characters');
  if (String(note).length > 500) throw new Error('--note: at most 500 characters');
  if (kind !== 'founder' && kind !== 'review') throw new Error('--kind must be founder or review');
  let expiresAt = null;
  if (expires) {
    const ms = Date.parse(expires);
    if (!Number.isFinite(ms)) throw new Error(`--expires: not a date: ${expires}`);
    expiresAt = new Date(ms).toISOString();
  }
  const pem = readFileSync(keyPath, 'utf8');
  const expected = publicKeyB64 ?? builtInPublicKey();
  if (!expected)
    throw new Error('the app has no built-in public key yet (FOUNDER_PUBLIC_KEY is empty)');
  if (publicKeyOf(pem) !== expected)
    throw new Error('this private key does not match the public key built into the app; refusing');
  const payload = {
    v: 1,
    id: randomUUID(),
    kind,
    name: String(name).trim(),
    issuedAt: now.toISOString(),
    expiresAt,
    note: String(note),
  };
  const line = signKey(payload, pem);
  const check = verifyKey(line, expected, now.getTime());
  if (!check.ok) throw new Error(`self-check failed (${check.error}); nothing written`);
  return { line, payload };
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function main(argv, out = console.log) {
  const [cmd] = argv;
  const keyPath = arg(argv, '--key') ?? DEFAULT_KEY_PATH;
  const publicKeyB64 = arg(argv, '--public-key');
  if (cmd === 'keygen') {
    const pub = keygen(keyPath);
    out(`Private key written to ${keyPath} (git-ignored; back it up offline).`);
    out(`Public key (put it in FOUNDER_PUBLIC_KEY): ${pub}`);
    return 0;
  }
  if (cmd === 'issue') {
    const file = arg(argv, '--out');
    if (!file) throw new Error('--out <file> is required');
    const { line, payload } = issue({
      name: arg(argv, '--name'),
      kind: arg(argv, '--kind'),
      expires: arg(argv, '--expires'),
      note: arg(argv, '--note') ?? '',
      keyPath,
      publicKeyB64,
    });
    writeFileSync(file, `${line}\n`, { flag: 'wx' });
    const again = verifyKey(readFileSync(file, 'utf8'), publicKeyB64 ?? builtInPublicKey());
    if (!again.ok) throw new Error(`written file failed verification (${again.error})`);
    out(`Issued ${payload.kind} key for ${payload.name} (id ${payload.id}) to ${file}; verified.`);
    return 0;
  }
  if (cmd === 'verify') {
    const file = argv[1];
    if (!file) throw new Error('verify <file>');
    const r = verifyKey(readFileSync(file, 'utf8'), publicKeyB64 ?? builtInPublicKey());
    if (!r.ok) {
      out(`Not valid: ${r.error}`);
      return 1;
    }
    out(
      `Valid ${r.payload.kind} key for ${r.payload.name} (id ${r.payload.id}), issued ${r.payload.issuedAt}, ` +
        `${r.payload.expiresAt ? `expires ${r.payload.expiresAt}` : 'never expires'}.`,
    );
    return 0;
  }
  out(
    'usage: license-tool.mjs keygen | issue --name <n> --kind founder|review [--expires <date>] --out <file> | verify <file>',
  );
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`license-tool: ${e.message}`);
    process.exitCode = 1;
  }
}
