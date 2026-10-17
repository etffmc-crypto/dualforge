/**
 * Public half of the founder/review key pair (Ed25519, base64 SPKI DER). The private half lives only on Ethan's PC at
 * F:\DualForge\secrets\founder-ed25519.pem (git-ignored) and is used by scripts/license-tool.mjs. Generated 2026-10-16.
 */
export const FOUNDER_PUBLIC_KEY = 'MCowBQYDK2VwAyEASeuNyZ7J9df9CxrBv/L8wQ5ibXkCJjLk6aeBYblZJa4=';

/**
 * Founder and review keys that no longer count (their payload `id`), checked on paste and on every start and wake.
 * To revoke one: add its id here and ship an update. Empty on 2026-10-16.
 */
export const REVOKED_FOUNDER_IDS: readonly string[] = [];
