import { describe, expect, it } from 'vitest';
import { resolveAppVersion } from '../src/main/app-version.js';

describe('resolveAppVersion', () => {
  it('prefers the build-time version over a bogus getVersion', () => {
    expect(
      resolveAppVersion({ built: '0.3.4', getVersion: () => '44.5.1', electronVersion: '44.5.1' }),
    ).toBe('0.3.4');
  });
  it('uses getVersion when no build constant exists', () => {
    expect(resolveAppVersion({ getVersion: () => '0.3.4', electronVersion: '44.5.1' })).toBe(
      '0.3.4',
    );
  });
  it('never reports the Electron version as the app version', () => {
    expect(resolveAppVersion({ getVersion: () => '44.5.1', electronVersion: '44.5.1' })).toBe(
      'unknown',
    );
  });
});
