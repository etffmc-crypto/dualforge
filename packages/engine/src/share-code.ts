import { ProfileSchema, type Profile } from '@dualforge/shared';

export const SHARE_PREFIX = 'DUALFORGE:';
export const SHARE_MAX_BYTES = 16 * 1024;

type Codec = (b: Uint8Array) => Uint8Array;

export class ShareCodeError extends Error {
  readonly code = 'E_SHARE_CODE';
  constructor(msg: string) { super(`E_SHARE_CODE: ${msg}`); this.name = 'ShareCodeError'; }
}

/** 'DUALFORGE:' + base64url(deflateRaw(JSON of the profile without its id)). `deflate` is injected (pure module). */
export function encodeShareCode(profile: Profile, deflate: Codec): string {
  const rest: Partial<Profile> = { ...profile };
  delete rest.id;
  const json = new TextEncoder().encode(JSON.stringify(rest));
  return SHARE_PREFIX + Buffer.from(deflate(json)).toString('base64url');
}

/** Validates with ProfileSchema, assigns a fresh id; throws ShareCodeError (code E_SHARE_CODE) on any failure or > 16 KiB. */
export function decodeShareCode(code: string, inflate: Codec): Profile {
  try {
    const trimmed = code.trim();
    if (!trimmed.startsWith(SHARE_PREFIX)) throw new ShareCodeError('missing prefix');
    const body = trimmed.slice(SHARE_PREFIX.length);
    if (!/^[A-Za-z0-9_-]*$/.test(body)) throw new ShareCodeError('not base64url');
    const bytes = inflate(new Uint8Array(Buffer.from(body, 'base64url')));
    if (bytes.length > SHARE_MAX_BYTES) throw new ShareCodeError('too large');
    const obj: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new ShareCodeError('not an object');
    const r = ProfileSchema.safeParse({ ...obj, id: crypto.randomUUID() });
    if (!r.success) throw new ShareCodeError('invalid profile');
    return r.data;
  } catch (e) {
    if (e instanceof ShareCodeError) throw e;
    throw new ShareCodeError('malformed share code');
  }
}
