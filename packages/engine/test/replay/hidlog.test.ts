import { describe, expect, it } from 'vitest';
import { entryBytes, parseHidlog, serializeHidlog } from '../../src/replay/hidlog.js';

describe('hidlog', () => {
  it('round-trips', () => {
    const e = [{ t: 0, hex: '01'.padEnd(128, '0') }, { t: 1, hex: 'ff'.repeat(64) }];
    expect(parseHidlog(serializeHidlog(e))).toEqual(e);
  });
  it('skips comments and blank lines', () => {
    const hex = '00'.repeat(64);
    expect(parseHidlog(`# hi\n\n{"t":3,"hex":"${hex}"}\n`)).toEqual([{ t: 3, hex }]);
  });
  it('entryBytes decodes hex', () => {
    expect([...entryBytes({ t: 0, hex: '0a0b' })]).toEqual([10, 11]);
  });
  it('rejects entries that are not 64 bytes', () => {
    expect(() => parseHidlog('{"t":0,"hex":"0102"}')).toThrow(/^E_HIDLOG_LINE: line 1$/);
  });
  it('rejects malformed lines', () => {
    expect(() => parseHidlog('{"t":"x"}')).toThrow();
  });
  it('reports bad lines by number only, never content', () => {
    let msg = '';
    try { parseHidlog(`{"t":1,"hex":"${'00'.repeat(64)}"}\nSECRET-garbage`); } catch (e) { msg = (e as Error).message; }
    expect(msg).toMatch(/^E_HIDLOG_LINE: line \d+$/);
    expect(msg).not.toContain('SECRET');
  });
});
