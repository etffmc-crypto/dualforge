import { describe, expect, it, vi } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { decodeShareCode, encodeShareCode } from '../src/share-code.js';

const id = (b: Uint8Array) => b;
const enc = (s: string) => 'DUALFORGE:' + Buffer.from(s).toString('base64url');

describe('share code', () => {
  it('round-trips (identity deflate), strips the id and assigns a fresh one', () => {
    const p = defaultProfile('orig', 'Mine');
    p.sticks.left.deadzone.anti = 0.25;
    const code = encodeShareCode(p, id);
    expect(code.startsWith('DUALFORGE:')).toBe(true);
    expect(
      JSON.parse(atob(code.slice(10).replace(/-/g, '+').replace(/_/g, '/'))),
    ).not.toHaveProperty('id');
    const q = decodeShareCode(code, id);
    expect(q.id).not.toBe('orig');
    expect(q.id.length).toBeGreaterThan(0);
    expect({ ...q, id: 'x' }).toEqual({ ...p, id: 'x' });
  });
  it('uses the injected deflate/inflate', () => {
    const rev = (b: Uint8Array) => Uint8Array.from(b).reverse();
    const p = defaultProfile('a', 'b');
    expect(decodeShareCode(encodeShareCode(p, rev), rev).name).toBe('b');
  });
  const bad = (code: string) => {
    try {
      decodeShareCode(code, id);
    } catch (e) {
      return (e as { code?: string }).code;
    }
    return 'no-throw';
  };
  it('rejects bad prefix / garbage / non-profile JSON with E_SHARE_CODE', () => {
    expect(bad('hello')).toBe('E_SHARE_CODE');
    expect(bad('DUALFORGE:@@@@')).toBe('E_SHARE_CODE');
    expect(bad('DUALFORGE:' + Buffer.from('not json').toString('base64url'))).toBe('E_SHARE_CODE');
    expect(bad(enc('[1,2]'))).toBe('E_SHARE_CODE');
    expect(bad(enc('{"schemaVersion":1}'))).toBe('E_SHARE_CODE');
  });
  it('wraps inflate failures', () => {
    const boom = () => {
      throw new Error('bad deflate');
    };
    expect(() => decodeShareCode(encodeShareCode(defaultProfile('a', 'b'), id), boom)).toThrow(
      /E_SHARE_CODE/,
    );
  });
  it('rejects oversize payloads (> 16 KiB decoded)', () => {
    const p = defaultProfile('a', 'b');
    const huge = JSON.stringify({ ...p, pad: 'x'.repeat(17 * 1024) });
    expect(bad(enc(huge))).toBe('E_SHARE_CODE');
  });
  it('rejects an oversize encoded body before inflating', () => {
    const spy = vi.fn((b: Uint8Array) => b);
    expect(() => decodeShareCode('DUALFORGE:' + 'A'.repeat(40 * 1024), spy)).toThrow(
      /E_SHARE_CODE/,
    );
    expect(spy).not.toHaveBeenCalled();
  });
  it('round-trips regardless of base64 padding length (unpadded body is re-padded before decoding)', () => {
    for (const n of ['a', 'ab', 'abc', 'abcd']) {
      const q = decodeShareCode(encodeShareCode(defaultProfile('x', n), id), id);
      expect(q.name).toBe(n);
    }
  });
});
