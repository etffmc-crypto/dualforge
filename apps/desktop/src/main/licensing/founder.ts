import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { FOUNDER_PUBLIC_KEY } from './founder-key.js';

export const FOUNDER_PREFIX = 'DFKEY1.';
/** Domain separation: the signature covers this line plus the payload bytes, so no other signed blob can pass. */
export const FOUNDER_DOMAIN = 'DualForge founder key v1\n';

export const FounderPayloadSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1).max(100),
  kind: z.enum(['founder', 'review']),
  name: z.string().min(1).max(100),
  issuedAt: z.string().max(64),
  expiresAt: z.string().max(64).nullable(),
  note: z.string().max(500).default(''),
});
export type FounderPayload = z.infer<typeof FounderPayloadSchema>;

export type FounderResult =
  | { ok: true; payload: FounderPayload }
  | { ok: false; error: 'prefix' | 'format' | 'signature' | 'payload' | 'expired' };

export interface FounderVerifier {
  verify(text: string, now: number): FounderResult;
}

/** Offline verifier for `DFKEY1.<payload>.<signature>` lines against one Ed25519 public key (base64 SPKI DER). */
export function createFounderVerifier(publicKeyB64: string = FOUNDER_PUBLIC_KEY): FounderVerifier {
  let key: KeyObject | null = null;
  try {
    key = createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch {
    key = null; // no usable key: every founder key is refused
  }
  return {
    verify(text, now) {
      const t = text.trim();
      if (!t.startsWith(FOUNDER_PREFIX)) return { ok: false, error: 'prefix' };
      const parts = t.slice(FOUNDER_PREFIX.length).split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: 'format' };
      const bytes = Buffer.from(parts[0], 'base64url');
      const sig = Buffer.from(parts[1], 'base64url');
      let good = false;
      try {
        good = !!key && verify(null, Buffer.concat([Buffer.from(FOUNDER_DOMAIN), bytes]), key, sig);
      } catch {
        good = false;
      }
      if (!good) return { ok: false, error: 'signature' };
      let raw: unknown;
      try {
        raw = JSON.parse(bytes.toString('utf8'));
      } catch {
        return { ok: false, error: 'payload' };
      }
      const p = FounderPayloadSchema.safeParse(raw);
      if (!p.success) return { ok: false, error: 'payload' };
      if (p.data.expiresAt !== null && !(Date.parse(p.data.expiresAt) > now))
        return { ok: false, error: 'expired' };
      return { ok: true, payload: p.data };
    },
  };
}
