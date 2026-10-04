import { describe, expect, it } from 'vitest';
import { entryBytes, parseHidlog, serializeHidlog } from '../../src/replay/hidlog.js';

describe('hidlog', () => {
  it('round-trips', () => {
    const e = [{ t: 0, hex: '01'.padEnd(128, '0') }, { t: 1, hex: 'ff'.repeat(64) }];
    expect(parseHidlog(serializeHidlog(e))).toEqual(e);
  });
  it('skips comments and blank lines', () => {
    expect(parseHidlog('# hi\n\n{"t":3,"hex":"00"}\n')).toEqual([{ t: 3, hex: '00' }]);
  });
  it('entryBytes decodes hex', () => {
    expect([...entryBytes({ t: 0, hex: '0a0b' })]).toEqual([10, 11]);
  });
  it('rejects malformed lines', () => {
    expect(() => parseHidlog('{"t":"x"}')).toThrow();
  });
});
