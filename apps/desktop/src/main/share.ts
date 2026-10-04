import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { decodeShareCode, encodeShareCode, SHARE_MAX_BYTES } from '@dualforge/engine';
import type { Profile } from '@dualforge/shared';

/** Output of inflate is capped (decompression-bomb guard); zlib throws past the cap and decodeShareCode maps it to E_SHARE_CODE. */
const inflate = (b: Uint8Array): Uint8Array =>
  inflateRawSync(b, { maxOutputLength: SHARE_MAX_BYTES });
const deflate = (b: Uint8Array): Uint8Array => deflateRawSync(b);

export const shareCodeFor = (p: Profile): string => encodeShareCode(p, deflate);
export const profileFromShareCode = (code: string): Profile => decodeShareCode(code, inflate);
