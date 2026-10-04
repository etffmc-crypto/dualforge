import { ProfileSchema, type Profile } from '@dualforge/shared';

export const SHARE_PREFIX = 'DUALFORGE:';
export const SHARE_MAX_BYTES = 16 * 1024;
/** Max encoded body length accepted before inflating (guards against decompression bombs). */
export const SHARE_MAX_BODY_CHARS = 32 * 1024;

const toB64Url = (b: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]!);
  return btoa(bin).replace(/[+]/g, '-').replace(/[/]/g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

type Codec = (b: Uint8Array) => Uint8Array;

export class ShareCodeError extends Error {
  readonly code = 'E_SHARE_CODE';
  constructor(msg: string) {
    super(`E_SHARE_CODE: ${msg}`);
    this.name = 'ShareCodeError';
  }
}

/** 'DUALFORGE:' + base64url(deflateRaw(JSON of the profile without its id)). `deflate` is injected (pure module). */
export function encodeShareCode(profile: Profile, deflate: Codec): string {
  const rest: Partial<Profile> = { ...profile };
  delete rest.id;
  const json = new TextEncoder().encode(JSON.stringify(rest));
  return SHARE_PREFIX + toB64Url(deflate(json));
}

/**
 * Validates with ProfileSchema, assigns a fresh id; throws ShareCodeError (code E_SHARE_CODE) on any failure or > 16 KiB.
 * SECURITY: the production `inflate` passed in must itself enforce a 16 KiB output cap (e.g. zlib.inflateRawSync(buf, { maxOutputLength: 16 * 1024 })); the
 * post-inflate check here cannot stop a decompression bomb. The encoded body is capped at 32 KiB before inflating. */
export function decodeShareCode(code: string, inflate: Codec): Profile {
  try {
    const trimmed = code.trim();
    if (!trimmed.startsWith(SHARE_PREFIX)) throw new ShareCodeError('missing prefix');
    const body = trimmed.slice(SHARE_PREFIX.length);
    if (body.length > SHARE_MAX_BODY_CHARS) throw new ShareCodeError('too large');
    if (!/^[A-Za-z0-9_-]*$/.test(body)) throw new ShareCodeError('not base64url');
    const bytes = inflate(fromB64Url(body));
    if (bytes.length > SHARE_MAX_BYTES) throw new ShareCodeError('too large');
    const obj: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj))
      throw new ShareCodeError('not an object');
    const r = ProfileSchema.safeParse({ ...obj, id: crypto.randomUUID() });
    if (!r.success) throw new ShareCodeError('invalid profile');
    return r.data;
  } catch (e) {
    if (e instanceof ShareCodeError) throw e;
    throw new ShareCodeError('malformed share code');
  }
}
