import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { logDirFor, resolveDataDir } from '../src/main/data-dir.js';

describe('resolveDataDir', () => {
  it('defaults to <appData>\\DualForge', () => {
    expect(resolveDataDir('C:\\Roaming', {})).toBe(join('C:\\Roaming', 'DualForge'));
  });
  it('DUALFORGE_DATA_DIR redirects everything, including the logs', () => {
    const dir = resolveDataDir('C:\\Roaming', { DUALFORGE_DATA_DIR: 'D:\\tmp\\e2e' });
    expect(dir).toBe('D:\\tmp\\e2e');
    expect(logDirFor(dir)).toBe(join('D:\\tmp\\e2e', 'logs'));
  });
  it('an empty variable is ignored', () => {
    expect(resolveDataDir('C:\\Roaming', { DUALFORGE_DATA_DIR: '' })).toBe(
      join('C:\\Roaming', 'DualForge'),
    );
  });
});
