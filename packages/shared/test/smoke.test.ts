import { describe, expect, it } from 'vitest';
import { SHARED_VERSION } from '../src/index.js';

describe('shared', () => {
  it('exports a version', () => {
    expect(SHARED_VERSION).toBe('0.1.0');
  });
});
