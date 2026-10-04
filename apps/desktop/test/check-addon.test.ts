import { describe, expect, it } from 'vitest';
import { compareMarker } from '../scripts/check-addon.mjs';

describe('compareMarker', () => {
  it('accepts a matching marker', () => {
    expect(compareMarker('electron=44.5.1 abi=149\n', '44.5.1').ok).toBe(true);
  });
  it('rejects a version mismatch', () => {
    const r = compareMarker('electron=44.5.0 abi=149', '44.5.1');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('44.5.0');
  });
  it('rejects missing, empty and malformed markers', () => {
    expect(compareMarker(null, '44.5.1').ok).toBe(false);
    expect(compareMarker('  ', '44.5.1').ok).toBe(false);
    expect(compareMarker('garbage', '44.5.1').ok).toBe(false);
  });
});
